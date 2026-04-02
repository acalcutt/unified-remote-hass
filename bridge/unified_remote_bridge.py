"""
unified_remote_bridge.py
━━━━━━━━━━━━━━━━━━━━━━━━
WebSocket bridge for the Unified Remote Home Assistant card.

┌─────────────────────┐  JSON over WS  ┌───────────────────────┐  TCP 9512  ┌──────────────────┐
│  HA Lovelace Card   │ ─────────────► │  unified_remote_bridge │ ──────────► │  Unified Remote  │
│  (browser)          │ ◄───────────── │  (this script, on PC)  │            │  Server (on PC)  │
└─────────────────────┘                └───────────────────────┘            └──────────────────┘
                                                 │
                                          Windows SendInput
                                       (mouse + keyboard)

Messages from the card:
  { "t": "move",         "dx": <float>, "dy": <float> }
  { "t": "scroll",       "dx": <float>, "dy": <float> }
  { "t": "click" }
  { "t": "double_click" }
  { "t": "right_click" }
  { "t": "down" }
  { "t": "up" }
  { "t": "text",         "text": <str>  }
  { "t": "key",          "key":  <str>  }
  { "t": "volume",       "action": "up"|"down"|"mute" }
  { "t": "media",        "action": "play_pause"|"stop"|"previous"|"next" }

Mouse / keyboard messages → Windows SendInput (ctypes)
Volume / media messages   → Unified Remote TCP protocol (port 9512)

Run:
    python bridge/unified_remote_bridge.py --host 0.0.0.0 --port 8765 \\
        --ur-host 127.0.0.1 [--ur-port 9512] [--ur-password "secret"]
"""

from __future__ import annotations

import argparse
import asyncio
import ctypes
import ctypes.wintypes as wintypes
import hashlib
import json
import logging
import struct
import threading
import time
import uuid
from typing import Any, Dict, Optional

import websockets
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK
from websockets.server import ServerConnection

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("websockets.server").setLevel(logging.WARNING)
logging.getLogger("websockets.client").setLevel(logging.WARNING)
log = logging.getLogger("ur-bridge")

# ═══════════════════════════════════════════════════════════════════════════════
#  Windows SendInput
# ═══════════════════════════════════════════════════════════════════════════════

ULONG_PTR = getattr(wintypes, "ULONG_PTR", ctypes.c_size_t)

INPUT_MOUSE    = 0
INPUT_KEYBOARD = 1

MOUSEEVENTF_MOVE      = 0x0001
MOUSEEVENTF_LEFTDOWN  = 0x0002
MOUSEEVENTF_LEFTUP    = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP   = 0x0010
MOUSEEVENTF_WHEEL     = 0x0800
MOUSEEVENTF_HWHEEL    = 0x1000
WHEEL_DELTA           = 120

KEYEVENTF_KEYUP   = 0x0002
KEYEVENTF_UNICODE = 0x0004

VK_VOLUME_MUTE = 0xAD
VK_VOLUME_DOWN = 0xAE
VK_VOLUME_UP   = 0xAF

KEY_MAP: Dict[str, int] = {
    "enter":      0x0D,
    "backspace":  0x08,
    "escape":     0x1B,
    "tab":        0x09,
    "space":      0x20,
    "delete":     0x2E,
    "arrow_left": 0x25,
    "arrow_right":0x27,
    "arrow_up":   0x26,
    "arrow_down": 0x28,
    "home":       0x24,
    "end":        0x23,
    "page_up":    0x21,
    "page_down":  0x22,
}


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx",          wintypes.LONG),
        ("dy",          wintypes.LONG),
        ("mouseData",   wintypes.DWORD),
        ("dwFlags",     wintypes.DWORD),
        ("time",        wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk",         wintypes.WORD),
        ("wScan",       wintypes.WORD),
        ("dwFlags",     wintypes.DWORD),
        ("time",        wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class _INPUTUNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("union", _INPUTUNION)]


_SendInput = ctypes.windll.user32.SendInput


def _mouse(flags: int, dx: int = 0, dy: int = 0, data: int = 0) -> None:
    mi  = MOUSEINPUT(dx, dy, data, flags, 0, 0)
    inp = INPUT(INPUT_MOUSE, _INPUTUNION(mi=mi))
    _SendInput(1, ctypes.byref(inp), ctypes.sizeof(inp))


def _key(vk: int, flags: int = 0, scan: int = 0) -> None:
    ki  = KEYBDINPUT(vk, scan, flags, 0, 0)
    inp = INPUT(INPUT_KEYBOARD, _INPUTUNION(ki=ki))
    _SendInput(1, ctypes.byref(inp), ctypes.sizeof(inp))


class InputInjector:
    """Translates JSON bridge messages to Windows input events."""

    SCROLL_SCALE = 4.0

    def __init__(self, scroll_scale: float = SCROLL_SCALE) -> None:
        self._scroll_scale = scroll_scale
        self._rem_x = 0.0
        self._rem_y = 0.0

    def move(self, dx: float, dy: float) -> None:
        _mouse(MOUSEEVENTF_MOVE, int(round(dx)), int(round(dy)))

    def scroll(self, dx: float, dy: float) -> None:
        self._rem_x += dx * self._scroll_scale
        self._rem_y += dy * self._scroll_scale

        sx = int(self._rem_x / WHEEL_DELTA)
        sy = int(self._rem_y / WHEEL_DELTA)
        self._rem_x -= sx * WHEEL_DELTA
        self._rem_y -= sy * WHEEL_DELTA

        if sy: _mouse(MOUSEEVENTF_WHEEL,  data=int(sy * WHEEL_DELTA))
        if sx: _mouse(MOUSEEVENTF_HWHEEL, data=int(sx * WHEEL_DELTA))

    def click(self) -> None:
        _mouse(MOUSEEVENTF_LEFTDOWN)
        _mouse(MOUSEEVENTF_LEFTUP)

    def right_click(self) -> None:
        _mouse(MOUSEEVENTF_RIGHTDOWN)
        _mouse(MOUSEEVENTF_RIGHTUP)

    def left_down(self) -> None:  _mouse(MOUSEEVENTF_LEFTDOWN)
    def left_up(self)   -> None:  _mouse(MOUSEEVENTF_LEFTUP)

    async def double_click(self) -> None:
        self.click()
        await asyncio.sleep(0.03)
        self.click()

    def type_text(self, text: str) -> None:
        for ch in text:
            if ch == "\n":
                self.press_key("enter")
                continue
            cp = ord(ch)
            _key(0, scan=cp, flags=KEYEVENTF_UNICODE)
            _key(0, scan=cp, flags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)

    def press_key(self, key: str) -> None:
        vk = KEY_MAP.get(key)
        if vk is None:
            log.warning("Unknown key: %s", key)
            return
        _key(vk)
        _key(vk, flags=KEYEVENTF_KEYUP)


# ═══════════════════════════════════════════════════════════════════════════════
#  Unified Remote TCP protocol
#  Wire format confirmed from PCAP analysis, April 2026.
#
#  Every message:  [4-byte big-endian length][payload]
#  Every payload starts with fixed prefix 0x00 0x01, followed by TLV fields.
#
#  Type bytes (confirmed):
#    0x00 = end-of-map
#    0x02 = nested map  (key null-terminated; value = further TLV until 0x00)
#    0x05 = string      (key null-terminated; value = null-terminated UTF-8)
#    0x06 = nested list (same structure as 0x02; used for Controls)
#    0x08 = integer     (key null-terminated; value = 1 byte)
# ═══════════════════════════════════════════════════════════════════════════════

UR_TCP_PORT         = 9512
UR_UDP_PORT         = 9511
UR_KEEPALIVE_SECS   = 55
UR_CONNECT_TIMEOUT  = 5.0
UR_READ_TIMEOUT     = 5.0

# Remotes used by the bridge
REMOTE_MEDIA  = "Unified.Media"
REMOTE_MOUSE  = "Relmtech.Basic Input"


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
        b"\x00\x01"                                          # fixed prefix
        + _field(0x08, "Action")   + b"\x00"                # Action = 0
        + _field(0x05, "Password") + _s(device_uuid)        # plain UUID initially
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
        _field(0x08, "Actions")     + b"\x01"
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
    Action 0x07 — run a named button on an open remote.

    Wire format verified against live PCAP capture (April 2026).
    Example for Unified.Media::volume_down confirmed raw hex:
      000108416374696f6e000705494400556e69666965642e4d656469610002
      4c61796f75740006436f6e74726f6c73000200024f6e416374696f6e0005
      4e616d6500766f6c756d655f646f776e000008547970650008000000...
    """
    on_action = (
        _field(0x05, "Name") + _s(button_name)
        + b"\x00"
    )
    control_entry = (
        _field(0x02, "OnAction") + on_action
        + _field(0x08, "Type")   + b"\x08"
        + b"\x00"
    )
    controls = (
        _field(0x02, "") + control_entry   # index entry with empty key
        + b"\x00"
    )
    layout = (
        _field(0x06, "Controls") + controls
        + b"\x00"
    )
    run_map = (
        _field(0x05, "Name") + _s(button_name)
        + b"\x00"
    )
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
    Build a UR Extras.Values list for mouse Run actions.
    params: list of (key_str, value_str) tuples, e.g. [("X", "-7"), ("Y", "-1")]
    Returns the complete Extras nested-map bytes (ends with 0x00 terminator).
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
    entries += b"\x00"                           # end Values list
    values = _field(0x06, "Values") + entries
    return _field(0x02, "Extras") + values + b"\x00"


def _build_mouse_run_map(name: str, params: list) -> bytes:
    """Build the Run (or OnAction) nested map for a mouse action."""
    return (
        _build_extras_values(params)
        + _field(0x05, "Name")   + _s(name)
        + _field(0x05, "Target") + _s("Core.Input")
        + b"\x00"
    )


def _build_mouse_action_udp(source_id: str, session_id: str, name: str, params: list) -> bytes:
    """
    Build a UDP mouse Run action packet for Relmtech.Basic Input.
    Confirmed wire format from PCAP analysis (PCAPdroid_02_Apr_17_46_42.pcapng).

    Key differences from TCP media Run actions:
      - Sent over UDP port 9512 (not TCP)
      - Includes Session field (TCP session UUID from server hello 'Password' field)
      - Includes Target="Core.Input" in both Run and OnAction maps
      - Extra parameters encoded as Extras.Values key-value string pairs

    Confirmed actions (PCAP-verified):
      MoveBy   params=[("X", str(dx)), ("Y", str(dy))]   — 1636 calls captured
      Click    params=[("Button", "Left"|"Right")]        — 9 calls captured

    Inferred actions (from Lua API docs, not yet PCAP-verified):
      VScroll  params=[("Amount", str(n))]
      HScroll  params=[("Amount", str(n))]
      Double   params=[("Button", "Left")]
      Down     params=[("Button", "Left")]
      Up       params=[("Button", "Left")]
    """
    run_map = _build_mouse_run_map(name, params)
    control_entry = (
        _field(0x02, "OnAction") + _build_mouse_run_map(name, params)
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
    UDP Action 0x0b — associates the UDP source port with the TCP session.
    Sent once over UDP immediately after TCP handshake completes.
    Observed as the first UDP packet in PCAP before any mouse Run actions.
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


class UnifiedRemoteClient:
    """
    Persistent TCP client to a Unified Remote server.
    Runs on a background thread; thread-safe send from asyncio via call_soon_threadsafe.
    """

    def __init__(self, host: str, port: int = UR_TCP_PORT, password: str = "") -> None:
        self.host     = host
        self.port     = port
        self.password = password

        self.source_id   = f"python-{uuid.uuid4().hex[:16]}"
        self.device_uuid = str(uuid.uuid4())

        self._sock:       Optional[Any] = None
        self._udp_sock:   Optional[Any] = None
        self._session_id: str = ""
        self._lock    = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._ready   = threading.Event()

    # ── public API ─────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Start the background connection thread."""
        self._running = True
        self._thread  = threading.Thread(target=self._run_loop, daemon=True, name="ur-client")
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        self._close_sock()
        if self._udp_sock:
            try:
                self._udp_sock.close()
            except Exception:
                pass
            self._udp_sock = None
        if self._thread:
            self._thread.join(timeout=3)

    def run_action(self, remote_id: str, button: str) -> None:
        """Send a TCP Run action (media/volume). Non-blocking; silently drops if disconnected."""
        pkt = _build_run_action(self.source_id, remote_id, button)
        self._send(pkt)

    def run_mouse_action(self, name: str, params: list) -> None:
        """
        Send a UDP mouse Run action to Relmtech.Basic Input.
        Non-blocking; silently drops if session not yet established.
        params: list of (key, value) string tuples, e.g. [("X", "-5"), ("Y", "2")]
        """
        if not self._session_id:
            log.debug("Mouse action '%s' dropped: no session yet", name)
            return
        pkt = _build_mouse_action_udp(self.source_id, self._session_id, name, params)
        self._send_udp(pkt)

    def _send_udp(self, data: bytes) -> None:
        import socket as _socket
        if self._udp_sock is None:
            try:
                self._udp_sock = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
            except Exception as exc:
                log.debug("Failed to create UDP socket: %s", exc)
                return
        try:
            self._udp_sock.sendto(data, (self.host, self.port))
        except Exception as exc:
            log.debug("UDP send error: %s", exc)

    def is_connected(self) -> bool:
        return self._ready.is_set()

    def wait_ready(self, timeout: float = 10.0) -> bool:
        return self._ready.wait(timeout)

    # ── internals ──────────────────────────────────────────────────────────────

    def _run_loop(self) -> None:
        """Reconnect loop — runs forever until stop() is called."""
        backoff = 2.0
        while self._running:
            try:
                self._connect_and_run()
            except Exception as exc:
                log.warning("UR connection error: %s — retrying in %.0fs", exc, backoff)
            if not self._running:
                break
            time.sleep(backoff)
            backoff = min(backoff * 1.5, 30.0)

    def _connect_and_run(self) -> None:
        import socket as _socket
        self._ready.clear()
        sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
        sock.settimeout(UR_CONNECT_TIMEOUT)
        sock.connect((self.host, self.port))
        sock.settimeout(UR_READ_TIMEOUT)

        with self._lock:
            self._sock = sock

        log.info("UR TCP connected to %s:%s", self.host, self.port)

        # ── Handshake ──────────────────────────────────────────────────────────
        # Step 1: Identify
        self._send(_build_connect(self.source_id, self.device_uuid))
        resp = self._recv()
        if resp is None:
            raise ConnectionError("No server hello")

        # Extract session UUID from server hello (confirmed from PCAP).
        # Server's Action-0x00 response contains Password = <session-UUID>.
        session_id = _extract_string_field(resp, "Password") or ""
        if session_id:
            self._session_id = session_id
            log.debug("UR session ID: %s…", session_id[:8])
        else:
            log.warning(
                "Could not extract session ID from server hello — "
                "UDP mouse will not work"
            )

        # Step 2: Auth
        pw_hash = _sha256(self.password) if self.password else _sha256(self.device_uuid)
        self._send(_build_auth(self.source_id, pw_hash))
        resp = self._recv()
        if resp is None:
            raise ConnectionError("No auth response")

        # Step 3: List remotes (completes server init)
        self._send(_build_list_remotes(self.source_id))
        self._drain(timeout=1.5)

        # Open media remote so we're ready to fire actions immediately
        self._send(_build_open_remote(self.source_id, REMOTE_MEDIA))
        self._drain(timeout=0.5)
        self._send(_build_load_remote(self.source_id, REMOTE_MEDIA))
        self._drain(timeout=0.5)

        # Open mouse remote + send UDP session association packet
        if self._session_id:
            self._send(_build_open_remote(self.source_id, REMOTE_MOUSE))
            self._drain(timeout=0.5)
            self._send_udp(_build_udp_session_init(self.source_id, self._session_id))
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
            log.debug("UR send error: %s", exc)
            self._close_sock()

    def _recv(self) -> Optional[bytes]:
        """Read one length-prefixed message."""
        header = self._recvn(4)
        if header is None:
            return None
        length = struct.unpack(">I", header)[0]
        if length == 0 or length > 2_000_000:
            return None
        return self._recvn(length)

    def _recvn(self, n: int) -> Optional[bytes]:
        import socket as _socket
        buf = b""
        while len(buf) < n:
            try:
                chunk = self._sock.recv(n - len(buf))
                if not chunk:
                    return None
                buf += chunk
            except _socket.timeout:
                return None
            except Exception:
                return None
        return buf

    def _drain(self, timeout: float = 0.5) -> None:
        """Discard incoming data for `timeout` seconds."""
        import socket as _socket
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


# ═══════════════════════════════════════════════════════════════════════════════
#  WebSocket handler
# ═══════════════════════════════════════════════════════════════════════════════

async def handle_client(
    ws: ServerConnection,
    injector: InputInjector,
    ur: Optional[UnifiedRemoteClient],
    scroll_scale: float = 4.0,
) -> None:
    log.info("Card connected: %s", ws.remote_address)
    # Per-connection UR scroll accumulator (same divisor as SendInput path)
    ur_scroll_rem_x: float = 0.0
    ur_scroll_rem_y: float = 0.0
    try:
        async for raw in ws:
            try:
                data: Dict[str, Any] = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue

            t = data.get("t")

            # ── Mouse → Unified Remote UDP (SendInput fallback when --ur-host not set) ──
            if t == "move":
                dx = float(data.get("dx", 0)); dy = float(data.get("dy", 0))
                if ur:
                    xi = int(round(dx)); yi = int(round(dy))
                    if xi or yi:
                        ur.run_mouse_action("MoveBy", [("X", str(xi)), ("Y", str(yi))])
                else:
                    injector.move(dx, dy)
            elif t == "scroll":
                dx = float(data.get("dx", 0)); dy = float(data.get("dy", 0))
                if ur:
                    ur_scroll_rem_x += dx * scroll_scale
                    ur_scroll_rem_y += dy * scroll_scale
                    xi = int(ur_scroll_rem_x / WHEEL_DELTA)
                    yi = int(ur_scroll_rem_y / WHEEL_DELTA)
                    ur_scroll_rem_x -= xi * WHEEL_DELTA
                    ur_scroll_rem_y -= yi * WHEEL_DELTA
                    if yi:
                        ur.run_mouse_action("VScroll", [("Amount", str(yi))])
                    if xi:
                        ur.run_mouse_action("HScroll", [("Amount", str(xi))])
                else:
                    injector.scroll(dx, dy)
            elif t == "click":
                if ur:
                    ur.run_mouse_action("Click", [("Button", "Left")])
                else:
                    injector.click()
            elif t == "double_click":
                if ur:
                    ur.run_mouse_action("Double", [("Button", "Left")])
                else:
                    await injector.double_click()
            elif t == "right_click":
                if ur:
                    ur.run_mouse_action("Click", [("Button", "Right")])
                else:
                    injector.right_click()
            elif t == "down":
                if ur:
                    ur.run_mouse_action("Down", [("Button", "Left")])
                else:
                    injector.left_down()
            elif t == "up":
                if ur:
                    ur.run_mouse_action("Up", [("Button", "Left")])
                else:
                    injector.left_up()
            elif t == "text":
                text = data.get("text", "")
                if isinstance(text, str) and text:
                    injector.type_text(text)
            elif t == "key":
                key = data.get("key")
                if isinstance(key, str):
                    injector.press_key(key)

            # ── Volume → Unified Remote ───────────────────────────────────────
            elif t == "volume":
                action = data.get("action")
                if action and ur:
                    _ur_volume(ur, action)
                elif action:
                    # Fallback: system media keys via SendInput
                    _fallback_volume(action)

            # ── Media → Unified Remote ────────────────────────────────────────
            elif t == "media":
                action = data.get("action")
                if action and ur:
                    _ur_media(ur, action)
                # No SendInput fallback for media (UR required)

            else:
                log.debug("Unknown message type: %s", t)

    except (ConnectionClosedError, ConnectionClosedOK):
        pass
    except Exception:
        log.exception("WebSocket handler error for %s", ws.remote_address)
    finally:
        log.info("Card disconnected: %s", ws.remote_address)


def _ur_volume(ur: UnifiedRemoteClient, action: str) -> None:
    mapping = {"up": "volume_up", "down": "volume_down", "mute": "volume_mute"}
    btn = mapping.get(action)
    if btn:
        ur.run_action(REMOTE_MEDIA, btn)
    else:
        log.warning("Unknown volume action: %s", action)


def _ur_media(ur: UnifiedRemoteClient, action: str) -> None:
    mapping = {
        "play_pause": "play_pause",
        "stop":       "stop",
        "previous":   "previous",
        "next":       "next",
    }
    btn = mapping.get(action)
    if btn:
        ur.run_action(REMOTE_MEDIA, btn)
    else:
        log.warning("Unknown media action: %s", action)


def _fallback_volume(action: str) -> None:
    """SendInput volume fallback when Unified Remote is not configured."""
    vk_map = {"up": VK_VOLUME_UP, "down": VK_VOLUME_DOWN, "mute": VK_VOLUME_MUTE}
    vk = vk_map.get(action)
    if vk:
        _key(vk)
        _key(vk, flags=KEYEVENTF_KEYUP)


# ═══════════════════════════════════════════════════════════════════════════════
#  Entry point
# ═══════════════════════════════════════════════════════════════════════════════

async def serve(
    host: str,
    port: int,
    scroll_scale: float,
    ur_host: Optional[str],
    ur_port: int,
    ur_password: str,
) -> None:
    injector = InputInjector(scroll_scale)

    ur: Optional[UnifiedRemoteClient] = None
    if ur_host:
        ur = UnifiedRemoteClient(ur_host, ur_port, ur_password)
        ur.start()
        log.info("Connecting to Unified Remote at %s:%s ...", ur_host, ur_port)
        if not ur.wait_ready(timeout=12.0):
            log.warning(
                "Unified Remote did not respond within 12 s — "
                "media/volume controls will not work until connection is established."
            )
    else:
        log.warning(
            "--ur-host not provided; media/volume controls disabled. "
            "Volume will fall back to Windows media keys."
        )

    async with websockets.serve(
        lambda ws: handle_client(ws, injector, ur, scroll_scale),
        host,
        port,
        max_queue=32,
        ping_interval=15,
        ping_timeout=15,
    ):
        log.info("Bridge WebSocket listening on %s:%s", host, port)
        if ur:
            log.info("Unified Remote: %s:%s (media + volume via UR)", ur_host, ur_port)
        log.info("Mouse via Unified Remote UDP (%s)" if ur else "Mouse via Windows SendInput", REMOTE_MOUSE)
        log.info("Keyboard via Windows SendInput")
        await asyncio.Future()  # run forever


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Unified Remote Home Assistant bridge — WebSocket → SendInput + UR TCP"
    )
    parser.add_argument("--host",        default="0.0.0.0",   help="WebSocket bind address (default 0.0.0.0)")
    parser.add_argument("--port",        type=int, default=8765, help="WebSocket port (default 8765)")
    parser.add_argument("--scroll-scale", type=float, default=4.0, help="Scroll sensitivity (default 4.0)")
    parser.add_argument("--ur-host",     default=None,        help="Unified Remote server IP (required for media/volume)")
    parser.add_argument("--ur-port",     type=int, default=UR_TCP_PORT, help=f"Unified Remote TCP port (default {UR_TCP_PORT})")
    parser.add_argument("--ur-password", default="",          help="Unified Remote server password (leave blank if none)")
    args = parser.parse_args()

    asyncio.run(serve(
        host=args.host,
        port=args.port,
        scroll_scale=args.scroll_scale,
        ur_host=args.ur_host,
        ur_port=args.ur_port,
        ur_password=args.ur_password,
    ))


if __name__ == "__main__":
    main()
