"""
Unified Remote TCP/UDP client — no Windows dependencies.

Wire format confirmed from PCAP analysis (April 2026).

Every TCP/UDP message:  [4-byte big-endian length][payload]
Every payload starts with 0x00 0x01 prefix, then TLV fields.

TLV type bytes (confirmed from PCAP):
  0x00 = end-of-map
  0x02 = nested map  (key \0-terminated; value = more TLV until 0x00)
  0x04 = boolean-ish (observed in UDP session init Capabilities)
  0x05 = string      (key \0-terminated; value = \0-terminated UTF-8)
  0x06 = nested list (same as 0x02; used for Controls array)
  0x08 = integer     (key \0-terminated; value = 1 byte)

TCP port 9512: handshake + media/volume Run actions (Unified.Media remote)
UDP port 9512: real-time mouse/keyboard Run actions (Relmtech.Basic Input remote)
"""
from __future__ import annotations

import hashlib
import logging
import socket
import struct
import threading
import time
import uuid
from typing import Any, Optional

log = logging.getLogger(__name__)

# ── Protocol constants ─────────────────────────────────────────────────────────

UR_TCP_PORT        = 9512
UR_KEEPALIVE_SECS  = 55
UR_CONNECT_TIMEOUT = 5.0
UR_READ_TIMEOUT    = 5.0
WHEEL_DELTA        = 120    # same unit as Windows WHEEL_DELTA

REMOTE_MEDIA = "Unified.Media"
REMOTE_MOUSE = "Relmtech.Basic Input"


# ═══════════════════════════════════════════════════════════════════════════════
#  Packet builders
# ═══════════════════════════════════════════════════════════════════════════════

def _s(text: str) -> bytes:
    """Null-terminated UTF-8 string."""
    return text.encode("utf-8") + b"\x00"


def _field(type_byte: int, key: str, value: bytes = b"") -> bytes:
    return bytes([type_byte]) + _s(key) + value


def _wrap(payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + payload


def _build_connect(source_id: str, device_uuid: str) -> bytes:
    """Action 0x00 — initial identification."""
    body = (
        b"\x00\x01"
        + _field(0x08, "Action")   + b"\x00"
        + _field(0x05, "Password") + _s(device_uuid)
        + _field(0x05, "Platform") + _s("android")
        + _field(0x08, "Request")  + b"\x00"
        + _field(0x05, "Source")   + _s(source_id)
        + _field(0x03, "Version")  + b"\x00\x00\x00\x0a\x00"
        + b"\x00"
    )
    return _wrap(body)


def _build_auth(source_id: str, pw_hash: str) -> bytes:
    """Action 0x01 — re-auth with SHA-256 hash + capabilities."""
    caps = (
        _field(0x08, "Actions")      + b"\x01"
        + _field(0x08, "Encryption2") + b"\x01"
        + _field(0x08, "Fast")        + b"\x00"
        + _field(0x08, "Grid")        + b"\x01"
        + _field(0x08, "Loading")     + b"\x01"
        + _field(0x08, "Sync")        + b"\x01"
        + b"\x00"
    )
    body = (
        b"\x00\x01"
        + _field(0x08, "Action")       + b"\x01"
        + _field(0x02, "Capabilities") + caps
        + _field(0x05, "Password")     + _s(pw_hash)
        + _field(0x08, "Request")      + b"\x01"
        + _field(0x05, "Source")       + _s(source_id)
        + b"\x00"
    )
    return _wrap(body)


def _build_list_remotes(source_id: str) -> bytes:
    """Action 0x0a — request remote list (finalises server handshake)."""
    body = (
        b"\x00\x01"
        + _field(0x08, "Action")  + b"\x0a"
        + _field(0x08, "Request") + b"\x0a"
        + _field(0x05, "Source")  + _s(source_id)
        + b"\x00"
    )
    return _wrap(body)


def _build_open_remote(source_id: str, remote_id: str) -> bytes:
    """Action 0x03 — open a remote (request layout)."""
    body = (
        b"\x00\x01"
        + _field(0x08, "Action")  + b"\x03"
        + _field(0x05, "ID")      + _s(remote_id)
        + _field(0x02, "Layout")  + b"\x00"
        + _field(0x08, "Request") + b"\x03"
        + _field(0x05, "Source")  + _s(source_id)
        + b"\x00"
    )
    return _wrap(body)


def _build_load_remote(source_id: str, remote_id: str) -> bytes:
    """Action 0x05 — load remote controls."""
    body = (
        b"\x00\x01"
        + _field(0x08, "Action")  + b"\x05"
        + _field(0x05, "ID")      + _s(remote_id)
        + _field(0x08, "Request") + b"\x05"
        + _field(0x05, "Source")  + _s(source_id)
        + b"\x00"
    )
    return _wrap(body)


def _build_run_action(source_id: str, remote_id: str, button_name: str) -> bytes:
    """
    Action 0x07 — run a named button on an open remote (TCP).
    Wire format verified against PCAP (April 2026). Used for Unified.Media.
    """
    on_action = _field(0x05, "Name") + _s(button_name) + b"\x00"
    control_entry = (
        _field(0x02, "OnAction") + on_action
        + _field(0x08, "Type")   + b"\x08"
        + b"\x00"
    )
    layout = (
        _field(0x06, "Controls") + _field(0x02, "") + control_entry + b"\x00"
        + b"\x00"
    )
    run_map = _field(0x05, "Name") + _s(button_name) + b"\x00"
    body = (
        b"\x00\x01"
        + _field(0x08, "Action")  + b"\x07"
        + _field(0x05, "ID")      + _s(remote_id)
        + _field(0x02, "Layout")  + layout
        + _field(0x08, "Request") + b"\x07"
        + _field(0x02, "Run")     + run_map
        + _field(0x05, "Source")  + _s(source_id)
        + b"\x00"
    )
    return _wrap(body)


def _build_keepalive(source_id: str) -> bytes:
    body = (
        b"\x00\x01"
        + _field(0x08, "KeepAlive") + b"\x01"
        + _field(0x05, "Source")    + _s(source_id)
        + b"\x00"
    )
    return _wrap(body)


def _extract_string_field(payload: bytes, field_name: str) -> Optional[str]:
    """Scan a UR message payload for a null-terminated string field by name."""
    search = b"\x05" + field_name.encode() + b"\x00"
    idx = payload.find(search)
    if idx < 0:
        return None
    start = idx + len(search)
    end = payload.find(b"\x00", start)
    if end < 0:
        return None
    return payload[start:end].decode("utf-8", errors="replace")


def _build_extras_values(params: list) -> bytes:
    """
    Build Extras.Values list for mouse/keyboard Run actions.
    params: list of (key_str, value_str) tuples.
    Wire format confirmed from PCAP (PCAPdroid_02_Apr_17_46_42.pcapng).
    """
    entries = b""
    for k, v in params:
        entry = (
            _field(0x05, "Key")   + _s(k)
            + _field(0x05, "Value") + _s(str(v))
            + b"\x00"
        )
        entries += _field(0x02, "") + entry
    entries += b"\x00"
    return _field(0x02, "Extras") + _field(0x06, "Values") + entries + b"\x00"


def _build_input_run_map(name: str, params: list) -> bytes:
    """Build the Run / OnAction nested map for Relmtech.Basic Input actions."""
    return (
        _build_extras_values(params)
        + _field(0x05, "Name")   + _s(name)
        + _field(0x05, "Target") + _s("Core.Input")
        + b"\x00"
    )


def _build_input_action_udp(
    source_id: str, session_id: str, name: str, params: list
) -> bytes:
    """
    Build a UDP Run action packet for Relmtech.Basic Input.
    Confirmed wire format from PCAP analysis (PCAPdroid_02_Apr_17_46_42.pcapng).

    Confirmed actions (PCAP-verified):
      MoveBy  params=[("X", str(dx)), ("Y", str(dy))]     — 1636 calls
      Click   params=[("Button", "Left"|"Right")]          — 9 calls

    Inferred from Lua API (not PCAP-verified):
      VScroll params=[("Amount", str(n))]
      HScroll params=[("Amount", str(n))]
      Double  params=[("Button", "Left")]
      Down    params=[("Button", "Left")]
      Up      params=[("Button", "Left")]
      Type    params=[("Text", str)]        — keyboard text
      Press   params=[("Key", ur_key_name)] — keyboard key
    """
    run_map = _build_input_run_map(name, params)
    control_entry = (
        _field(0x02, "OnAction") + _build_input_run_map(name, params)
        + _field(0x08, "Type")   + b"\x08"
        + b"\x00"
    )
    layout = (
        _field(0x06, "Controls") + _field(0x02, "") + control_entry + b"\x00"
        + b"\x00"
    )
    body = (
        b"\x00\x01"
        + _field(0x08, "Action")  + b"\x07"
        + _field(0x05, "ID")      + _s(REMOTE_MOUSE)
        + _field(0x02, "Layout")  + layout
        + _field(0x08, "Request") + b"\x07"
        + _field(0x02, "Run")     + run_map
        + _field(0x05, "Session") + _s(session_id)
        + _field(0x05, "Source")  + _s(source_id)
        + b"\x00"
    )
    return _wrap(body)


def _build_udp_session_init(source_id: str, session_id: str) -> bytes:
    """
    UDP Action 0x0b — associates this UDP source port with the TCP session.
    Must be sent once after TCP handshake before any mouse/keyboard UDP packets.
    Confirmed from PCAP (first UDP packet before any MoveBy packets).
    """
    caps = _field(0x04, "Fast") + b"\x01" + b"\x00"
    body = (
        b"\x00\x01"
        + _field(0x08, "Action")       + b"\x0b"
        + _field(0x02, "Capabilities") + caps
        + _field(0x08, "Request")      + b"\x0b"
        + _field(0x05, "Session")      + _s(session_id)
        + _field(0x05, "Source")       + _s(source_id)
        + b"\x00"
    )
    return _wrap(body)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


# ═══════════════════════════════════════════════════════════════════════════════
#  UnifiedRemoteClient
# ═══════════════════════════════════════════════════════════════════════════════

class UnifiedRemoteClient:
    """
    Persistent TCP+UDP client for a Unified Remote server.
    Runs a background reconnect thread; public methods are thread-safe.

    Usage:
        client = UnifiedRemoteClient("192.168.1.100", password="secret")
        client.start()
        client.wait_ready(timeout=10)
        client.run_action(REMOTE_MEDIA, "play_pause")
        client.run_mouse_action("MoveBy", [("X", "5"), ("Y", "-3")])
        client.stop()
    """

    def __init__(
        self,
        host: str,
        port: int = UR_TCP_PORT,
        password: str = "",
        scroll_scale: float = 4.0,
    ) -> None:
        self.host     = host
        self.port     = port
        self.password = password

        self._scroll_scale = scroll_scale
        self._scroll_rem_x = 0.0
        self._scroll_rem_y = 0.0
        self._scroll_lock  = threading.Lock()

        self.source_id   = f"ha-{uuid.uuid4().hex[:16]}"
        self.device_uuid = str(uuid.uuid4())

        self._sock:        Optional[Any]   = None
        self._udp_sock:    Optional[Any]   = None
        self._session_id:  str             = ""
        self._lock         = threading.Lock()
        self._running      = False
        self._thread: Optional[threading.Thread] = None
        self._ready        = threading.Event()

    # ── Public API ─────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Start the background connection thread (non-blocking)."""
        self._running = True
        self._thread  = threading.Thread(
            target=self._run_loop, daemon=True, name="ur-client"
        )
        self._thread.start()

    def stop(self) -> None:
        """Stop the client; blocks up to 3 s waiting for the thread."""
        self._running = False
        self._close_sock()
        udp, self._udp_sock = self._udp_sock, None
        if udp:
            try:
                udp.close()
            except Exception:
                pass
        if self._thread:
            self._thread.join(timeout=3)

    def is_connected(self) -> bool:
        return self._ready.is_set()

    def wait_ready(self, timeout: float = 10.0) -> bool:
        return self._ready.wait(timeout)

    def run_action(self, remote_id: str, button: str) -> None:
        """Send a TCP Run action (media / volume). Fire-and-forget."""
        self._send(_build_run_action(self.source_id, remote_id, button))

    def run_mouse_action(self, name: str, params: list) -> None:
        """
        Send a UDP mouse action to Relmtech.Basic Input.
        Silently dropped if UDP session not yet established.
        params: list of (key, value) string tuples, e.g. [("X", "-5"), ("Y", "2")]
        """
        if not self._session_id:
            log.debug("Mouse action '%s' dropped: no session yet", name)
            return
        self._send_udp(
            _build_input_action_udp(
                self.source_id, self._session_id, name, params
            )
        )

    def run_keyboard_action(self, name: str, params: list) -> None:
        """
        Send a keyboard action via UDP to Relmtech.Basic Input.
        Uses the same wire format as mouse actions.
        Inferred from UR Lua API — not yet PCAP-verified.
          Type  params=[("Text", "hello world")]
          Press params=[("Key", "return")]
        """
        self.run_mouse_action(name, params)

    def scroll_mouse(self, dx: float, dy: float) -> None:
        """
        Accumulate scroll deltas and fire VScroll/HScroll when WHEEL_DELTA
        threshold is crossed.  Thread-safe accumulator shared across callers.
        scroll_scale is applied here (set via constructor).
        """
        with self._scroll_lock:
            self._scroll_rem_x += dx * self._scroll_scale
            self._scroll_rem_y += dy * self._scroll_scale
            xi = int(self._scroll_rem_x / WHEEL_DELTA)
            yi = int(self._scroll_rem_y / WHEEL_DELTA)
            self._scroll_rem_x -= xi * WHEEL_DELTA
            self._scroll_rem_y -= yi * WHEEL_DELTA

        if yi:
            self.run_mouse_action("VScroll", [("Amount", str(yi))])
        if xi:
            self.run_mouse_action("HScroll", [("Amount", str(xi))])

    # ── Internal ───────────────────────────────────────────────────────────────

    def _run_loop(self) -> None:
        backoff = 2.0
        while self._running:
            try:
                self._connect_and_run()
            except Exception as exc:
                log.warning(
                    "UR connection error: %s — retrying in %.0f s", exc, backoff
                )
            if not self._running:
                break
            time.sleep(backoff)
            backoff = min(backoff * 1.5, 30.0)

    def _connect_and_run(self) -> None:
        self._ready.clear()
        self._session_id = ""

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(UR_CONNECT_TIMEOUT)
        sock.connect((self.host, self.port))
        sock.settimeout(UR_READ_TIMEOUT)

        with self._lock:
            self._sock = sock

        log.info("UR TCP connected to %s:%s", self.host, self.port)

        # ── Step 1: Identify ───────────────────────────────────────────────────
        self._send(_build_connect(self.source_id, self.device_uuid))
        resp = self._recv()
        if resp is None:
            raise ConnectionError("No server hello")

        # Extract session UUID from server hello (confirmed from PCAP).
        # The server's Action-0x00 response contains Password = <session-UUID>.
        session_id = _extract_string_field(resp, "Password") or ""
        if session_id:
            self._session_id = session_id
            log.debug("UR session ID: %s…", session_id[:8])
        else:
            log.warning(
                "Could not extract session ID from server hello — "
                "UDP mouse/keyboard will not work"
            )

        # ── Step 2: Auth ───────────────────────────────────────────────────────
        pw_hash = _sha256(self.password) if self.password else _sha256(self.device_uuid)
        self._send(_build_auth(self.source_id, pw_hash))
        resp = self._recv()
        if resp is None:
            raise ConnectionError("No auth response")

        # ── Step 3: List remotes (completes server-side handshake) ────────────
        self._send(_build_list_remotes(self.source_id))
        self._drain(timeout=1.5)

        # ── Open media remote ──────────────────────────────────────────────────
        self._send(_build_open_remote(self.source_id, REMOTE_MEDIA))
        self._drain(timeout=0.5)
        self._send(_build_load_remote(self.source_id, REMOTE_MEDIA))
        self._drain(timeout=0.5)

        # ── Open mouse/input remote + send UDP session association ─────────────
        if self._session_id:
            self._send(_build_open_remote(self.source_id, REMOTE_MOUSE))
            self._drain(timeout=0.5)
            init_pkt = _build_udp_session_init(self.source_id, self._session_id)
            self._send_udp(init_pkt)
            log.info(
                "UR UDP session initialised — session=%s…", self._session_id[:8]
            )

        log.info("UR handshake complete — source=%s", self.source_id)
        self._ready.set()

        # ── Keep-alive loop ────────────────────────────────────────────────────
        last_ka = time.time()
        while self._running:
            time.sleep(1.0)
            if time.time() - last_ka >= UR_KEEPALIVE_SECS:
                self._send(_build_keepalive(self.source_id))
                last_ka = time.time()

    def _send(self, data: bytes) -> None:
        with self._lock:
            sock = self._sock
        if sock is None:
            return
        try:
            sock.sendall(data)
        except Exception as exc:
            log.debug("UR TCP send error: %s", exc)
            self._close_sock()

    def _send_udp(self, data: bytes) -> None:
        if self._udp_sock is None:
            try:
                self._udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            except Exception as exc:
                log.debug("Failed to create UDP socket: %s", exc)
                return
        try:
            self._udp_sock.sendto(data, (self.host, self.port))
        except Exception as exc:
            log.debug("UR UDP send error: %s", exc)

    def _recv(self) -> Optional[bytes]:
        header = self._recvn(4)
        if header is None:
            return None
        length = struct.unpack(">I", header)[0]
        if length == 0 or length > 2_000_000:
            return None
        return self._recvn(length)

    def _recvn(self, n: int) -> Optional[bytes]:
        buf = b""
        while len(buf) < n:
            try:
                chunk = self._sock.recv(n - len(buf))  # type: ignore[union-attr]
                if not chunk:
                    return None
                buf += chunk
            except socket.timeout:
                return None
            except Exception:
                return None
        return buf

    def _drain(self, timeout: float = 0.5) -> None:
        """Discard all incoming data for `timeout` seconds."""
        if self._sock is None:
            return
        self._sock.settimeout(0.1)
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._recv() is None:
                break
        self._sock.settimeout(UR_READ_TIMEOUT)

    def _close_sock(self) -> None:
        self._ready.clear()
        with self._lock:
            sock, self._sock = self._sock, None
        if sock:
            try:
                sock.close()
            except Exception:
                pass
