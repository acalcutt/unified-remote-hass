#!/usr/bin/env python3
"""
unified_remote_client.py
------------------------
Python client for Unified Remote server.
Reverse-engineered from PCAP analysis — April 2026.

Supports:
- Manual IP/port entry
- UDP auto-discovery (broadcast on LAN)
- Media controls via Unified.Media remote

Usage:
    python unified_remote_client.py                  # interactive
    python unified_remote_client.py --host 192.168.0.92
    python unified_remote_client.py --host 192.168.0.92 --action play_pause
"""

import socket
import struct
import hashlib
import threading
import time
import uuid
import argparse
import sys
from typing import Optional


# ─── Constants ────────────────────────────────────────────────────────────────

DEFAULT_TCP_PORT = 9512
DEFAULT_UDP_PORT = 9511
DISCOVERY_TIMEOUT = 3.0        # seconds to wait for discovery responses
KEEPALIVE_INTERVAL = 55.0      # seconds between keep-alive pings
CONNECT_TIMEOUT = 5.0

# The repeating discovery broadcast magic bytes (10-byte pattern × 3)
DISCOVERY_MAGIC = bytes.fromhex("364e20547c2d41722d41") * 3

# Media remote ID
REMOTE_MEDIA = "Unified.Media"

# Media button names (from PCAP analysis)
MEDIA_BUTTONS = {
    "play_pause":   "play_pause",
    "play":         "play_pause",
    "pause":        "play_pause",
    "stop":         "stop",
    "next":         "next",
    "previous":     "previous",
    "prev":         "previous",
    "volume_up":    "volume_up",
    "vol_up":       "volume_up",
    "volume_down":  "volume_down",
    "vol_down":     "volume_down",
    "volume_mute":  "volume_mute",
    "mute":         "volume_mute",
}


# ─── Protocol Encoding ────────────────────────────────────────────────────────

def encode_str(s: str) -> bytes:
    """Encode a null-terminated string."""
    return s.encode("utf-8") + b"\x00"

def encode_field(type_byte: int, key: str, value: bytes = b"") -> bytes:
    """Encode a single key-value field."""
    return bytes([type_byte]) + encode_str(key) + value

def encode_message(fields: bytes) -> bytes:
    """Wrap fields in the 4-byte length prefix."""
    return struct.pack(">I", len(fields)) + fields


def build_connect_packet(source_id: str, device_uuid: str) -> bytes:
    """
    Action 0x00 — initial identification.
    Sent immediately on TCP connect with plain-text device UUID as password.
    """
    body = (
        encode_field(0x01, "Action") +
        b"\x00" +                                            # Action value = 0x00
        encode_field(0x05, "Password") + encode_str(device_uuid) +
        encode_field(0x05, "Platform") + encode_str("android") +
        encode_field(0x08, "Request") + b"\x00" +
        encode_field(0x05, "Source") + encode_str(source_id) +
        encode_field(0x03, "Version") + b"\x00\x00\x00\x00\x0a\x00"
    )
    return encode_message(body)


def build_auth_packet(source_id: str, password_hash: str, request_id: int = 1) -> bytes:
    """
    Action 0x01 — re-auth with SHA-256 password hash + capability advertisement.
    """
    # Capabilities sub-map
    caps = (
        encode_field(0x04, "Actions") + b"\x01" +
        encode_field(0x04, "Encryption2") + b"\x01" +
        encode_field(0x04, "Fast") + b"\x00" +
        encode_field(0x04, "Grid") + b"\x01" +
        encode_field(0x04, "Loading") + b"\x01" +
        encode_field(0x04, "Sync") + b"\x01" +
        b"\x00"
    )
    body = (
        encode_field(0x01, "Action") + bytes([request_id]) +
        encode_field(0x02, "Capabilities") + caps +
        encode_field(0x05, "Password") + encode_str(password_hash) +
        encode_field(0x08, "Request") + bytes([request_id]) +
        encode_field(0x05, "Source") + encode_str(source_id)
    )
    return encode_message(body)


def build_list_remotes_packet(source_id: str) -> bytes:
    """Action 0x0a — request the remote list."""
    body = (
        encode_field(0x01, "Action") + b"\x0a" +
        encode_field(0x08, "Request") + b"\x0a" +
        encode_field(0x05, "Source") + encode_str(source_id)
    )
    return encode_message(body)


def build_open_remote_packet(source_id: str, remote_id: str, request_id: int = 3) -> bytes:
    """Action 0x03 — open/request layout for a remote."""
    body = (
        encode_field(0x01, "Action") + bytes([request_id]) +
        encode_field(0x05, "ID") + encode_str(remote_id) +
        encode_field(0x02, "Layout") + b"\x00" +
        encode_field(0x08, "Request") + bytes([request_id]) +
        encode_field(0x05, "Source") + encode_str(source_id)
    )
    return encode_message(body)


def build_load_remote_packet(source_id: str, remote_id: str, request_id: int = 5) -> bytes:
    """Action 0x05 — load remote controls."""
    body = (
        encode_field(0x01, "Action") + bytes([request_id]) +
        encode_field(0x05, "ID") + encode_str(remote_id) +
        encode_field(0x08, "Request") + bytes([request_id]) +
        encode_field(0x05, "Source") + encode_str(source_id)
    )
    return encode_message(body)


def build_run_action_packet(source_id: str, remote_id: str, button_name: str,
                            request_id: int = 7) -> bytes:
    """
    Action 0x07 — run a named button on an open remote.

    This is the core command used for all media controls.
    Observed hex structure for 'volume_down' on Unified.Media:
      Action=07, ID=Unified.Media, Layout={Controls={[0]={OnAction={Name=volume_down, Type=08}}}},
      Request=07, Run={Name=volume_down}, Source=...
    """
    btn = button_name.encode("utf-8")

    # Build Layout.Controls.OnAction sub-structure
    on_action = (
        encode_field(0x05, "Name") + encode_str(button_name) +
        encode_field(0x08, "Type") + b"\x08" +
        b"\x00"
    )
    control_entry = (
        encode_field(0x02, "OnAction") + on_action +
        b"\x00"
    )
    controls = (
        encode_field(0x02, "") + control_entry +   # index 0
        b"\x00"
    )
    layout = (
        encode_field(0x06, "Controls") + controls +
        b"\x00"
    )

    # Run sub-map
    run_map = (
        encode_field(0x05, "Name") + encode_str(button_name) +
        b"\x00"
    )

    body = (
        encode_field(0x01, "Action") + bytes([request_id]) +
        encode_field(0x05, "ID") + encode_str(remote_id) +
        encode_field(0x02, "Layout") + layout +
        encode_field(0x08, "Request") + bytes([request_id]) +
        encode_field(0x02, "Run") + run_map +
        encode_field(0x05, "Source") + encode_str(source_id)
    )
    return encode_message(body)


def build_keepalive_packet(source_id: str) -> bytes:
    """KeepAlive packet — sent every ~55 seconds."""
    body = (
        encode_field(0x04, "KeepAlive") + b"\x01" +
        encode_field(0x05, "Source") + encode_str(source_id)
    )
    return encode_message(body)


def hash_password(password: str) -> str:
    """SHA-256 hash of the password (lowercase hex)."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# ─── Discovery ────────────────────────────────────────────────────────────────

def discover_servers(timeout: float = DISCOVERY_TIMEOUT) -> list[tuple[str, int, str]]:
    """
    Broadcast discovery packet and collect responses.
    Returns list of (ip, port, server_name) tuples.
    """
    results = []
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(0.5)

    try:
        sock.sendto(DISCOVERY_MAGIC, ("255.255.255.255", DEFAULT_UDP_PORT))
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                data, addr = sock.recvfrom(1024)
                server_name = _parse_discovery_response(data)
                results.append((addr[0], DEFAULT_TCP_PORT, server_name or addr[0]))
            except socket.timeout:
                pass
    except PermissionError:
        print("[!] Broadcast requires elevated permissions on some systems.")
    finally:
        sock.close()

    return results


def _parse_discovery_response(data: bytes) -> Optional[str]:
    """Attempt to extract server name from discovery response (best-effort)."""
    try:
        return data.decode("utf-8", errors="replace").strip("\x00")
    except Exception:
        return None


# ─── Client ───────────────────────────────────────────────────────────────────

class UnifiedRemoteClient:
    """
    TCP client for Unified Remote server.

    Quick start:
        client = UnifiedRemoteClient("192.168.0.92")
        client.connect()
        client.media_play_pause()
        client.disconnect()
    """

    def __init__(self, host: str, port: int = DEFAULT_TCP_PORT, password: str = ""):
        self.host = host
        self.port = port
        self.password = password
        self.source_id = f"python-{uuid.uuid4().hex[:16]}"
        self.device_uuid = str(uuid.uuid4())
        self._sock: Optional[socket.socket] = None
        self._keepalive_thread: Optional[threading.Thread] = None
        self._running = False

    # ── Connection ──────────────────────────────────────────────────────────

    def connect(self) -> bool:
        """
        Establish connection and complete the handshake.
        Returns True on success.
        """
        print(f"[*] Connecting to {self.host}:{self.port}...")
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.settimeout(CONNECT_TIMEOUT)

        try:
            self._sock.connect((self.host, self.port))
        except (socket.timeout, ConnectionRefusedError, OSError) as e:
            print(f"[!] Connection failed: {e}")
            return False

        self._sock.settimeout(5.0)

        # Step 1: Send initial identification
        self._send(build_connect_packet(self.source_id, self.device_uuid))
        resp = self._recv()
        if resp is None:
            print("[!] No response to initial connect.")
            return False
        print(f"[+] Server hello received ({len(resp)} bytes)")

        # Step 2: Send auth with hashed password
        pw_hash = hash_password(self.password) if self.password else hash_password(self.device_uuid)
        self._send(build_auth_packet(self.source_id, pw_hash))
        resp = self._recv()
        if resp is None:
            print("[!] No auth response.")
            return False
        print(f"[+] Auth response received ({len(resp)} bytes)")

        # Step 3: Send list request (required by server to complete setup)
        self._send(build_list_remotes_packet(self.source_id))
        resp = self._recv()
        if resp is not None:
            print(f"[+] Remote list received ({len(resp)} bytes)")

        # Drain any additional startup messages
        self._drain(timeout=1.0)

        print(f"[+] Connected! Source ID: {self.source_id}")
        self._running = True
        self._start_keepalive()
        return True

    def disconnect(self):
        """Close the connection cleanly."""
        self._running = False
        if self._keepalive_thread:
            self._keepalive_thread.join(timeout=2)
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
        self._sock = None
        print("[*] Disconnected.")

    # ── Media Control ───────────────────────────────────────────────────────

    def _open_remote(self, remote_id: str):
        """Open a remote (get layout) — required before running actions."""
        self._send(build_open_remote_packet(self.source_id, remote_id))
        resp = self._recv()
        # Load controls
        self._send(build_load_remote_packet(self.source_id, remote_id))
        self._recv()

    def run_action(self, remote_id: str, button_name: str) -> bool:
        """Send a Run action for a named button on the given remote."""
        if self._sock is None:
            print("[!] Not connected.")
            return False
        try:
            pkt = build_run_action_packet(self.source_id, remote_id, button_name)
            self._send(pkt)
            print(f"[>] {remote_id} / {button_name}")
            return True
        except Exception as e:
            print(f"[!] run_action failed: {e}")
            return False

    # Convenience media methods
    def media_play_pause(self):
        return self.run_action(REMOTE_MEDIA, "play_pause")

    def media_stop(self):
        return self.run_action(REMOTE_MEDIA, "stop")

    def media_next(self):
        return self.run_action(REMOTE_MEDIA, "next")

    def media_previous(self):
        return self.run_action(REMOTE_MEDIA, "previous")

    def media_volume_up(self):
        return self.run_action(REMOTE_MEDIA, "volume_up")

    def media_volume_down(self):
        return self.run_action(REMOTE_MEDIA, "volume_down")

    def media_mute(self):
        return self.run_action(REMOTE_MEDIA, "volume_mute")

    # ── Internal ────────────────────────────────────────────────────────────

    def _send(self, data: bytes):
        if self._sock:
            self._sock.sendall(data)

    def _recv(self) -> Optional[bytes]:
        """Read one length-prefixed message."""
        try:
            header = self._recvn(4)
            if header is None:
                return None
            length = struct.unpack(">I", header)[0]
            if length > 2_000_000:   # sanity cap
                return None
            return self._recvn(length)
        except Exception:
            return None

    def _recvn(self, n: int) -> Optional[bytes]:
        """Read exactly n bytes."""
        buf = b""
        while len(buf) < n:
            try:
                chunk = self._sock.recv(n - len(buf))
                if not chunk:
                    return None
                buf += chunk
            except socket.timeout:
                return None
        return buf

    def _drain(self, timeout: float = 0.5):
        """Read and discard pending data for a short window."""
        self._sock.settimeout(timeout)
        while True:
            if self._recv() is None:
                break
        self._sock.settimeout(None)

    def _keepalive_loop(self):
        """Background thread: send keep-alive packets periodically."""
        while self._running:
            time.sleep(KEEPALIVE_INTERVAL)
            if self._running and self._sock:
                try:
                    self._send(build_keepalive_packet(self.source_id))
                except Exception:
                    break

    def _start_keepalive(self):
        self._keepalive_thread = threading.Thread(
            target=self._keepalive_loop, daemon=True
        )
        self._keepalive_thread.start()


# ─── Interactive / CLI ────────────────────────────────────────────────────────

def interactive_mode(client: UnifiedRemoteClient):
    """Simple interactive shell."""
    print("\nCommands: play_pause, stop, next, prev, vol_up, vol_down, mute, quit")
    while True:
        try:
            cmd = input("> ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            break

        if cmd in ("quit", "exit", "q"):
            break
        elif cmd in ("play_pause", "play", "pause"):
            client.media_play_pause()
        elif cmd == "stop":
            client.media_stop()
        elif cmd in ("next", "n"):
            client.media_next()
        elif cmd in ("prev", "previous", "p"):
            client.media_previous()
        elif cmd in ("vol_up", "volume_up", "+"):
            client.media_volume_up()
        elif cmd in ("vol_down", "volume_down", "-"):
            client.media_volume_down()
        elif cmd in ("mute", "m"):
            client.media_mute()
        else:
            # Try as a raw button name
            print(f"Unknown command '{cmd}'. Trying as raw button name...")
            client.run_action(REMOTE_MEDIA, cmd)


def main():
    parser = argparse.ArgumentParser(description="Unified Remote Python client")
    parser.add_argument("--host", help="Server IP address")
    parser.add_argument("--port", type=int, default=DEFAULT_TCP_PORT, help=f"TCP port (default {DEFAULT_TCP_PORT})")
    parser.add_argument("--password", default="", help="Server password (leave blank if none)")
    parser.add_argument("--action", help="Single action to run then exit (e.g. play_pause)")
    parser.add_argument("--discover", action="store_true", help="Discover servers and exit")
    args = parser.parse_args()

    # Discovery-only mode
    if args.discover:
        print("[*] Broadcasting discovery...")
        servers = discover_servers()
        if servers:
            for ip, port, name in servers:
                print(f"  Found: {name} at {ip}:{port}")
        else:
            print("  No servers found.")
        return

    # Determine host
    host = args.host
    if not host:
        # Try auto-discovery first
        print("[*] No host specified, attempting auto-discovery...")
        servers = discover_servers(timeout=2.0)
        if servers:
            host, port, name = servers[0]
            print(f"[+] Found server: {name} at {host}:{port}")
            args.port = port
        else:
            print("[!] No servers found automatically.")
            host = input("Enter server IP address: ").strip()
            if not host:
                print("No host provided. Exiting.")
                sys.exit(1)

    client = UnifiedRemoteClient(host, args.port, args.password)
    if not client.connect():
        sys.exit(1)

    try:
        if args.action:
            # Single-shot action
            button = MEDIA_BUTTONS.get(args.action.lower(), args.action)
            client.run_action(REMOTE_MEDIA, button)
            time.sleep(0.5)   # give the packet time to send
        else:
            interactive_mode(client)
    finally:
        client.disconnect()


if __name__ == "__main__":
    main()