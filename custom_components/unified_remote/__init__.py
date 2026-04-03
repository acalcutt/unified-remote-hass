"""
Unified Remote — Home Assistant integration.

Bridges HA Lovelace card commands to a Unified Remote server over TCP/UDP.

Architecture:
  Lovelace card (browser)
    ──[HA native WebSocket]──►  unified_remote/command  (this handler)
                                        │
                              ┌─────────┴──────────┐
                              ▼                     ▼
                       UR UDP :9512           UR TCP :9512
                   (mouse/keyboard)         (media/volume)
                   Relmtech.Basic Input    Unified.Media
"""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .client import REMOTE_MEDIA, UnifiedRemoteClient
from .const import (
    CONF_SCROLL_SCALE,
    CONF_UR_HOST,
    CONF_UR_PASSWORD,
    CONF_UR_PORT,
    DEFAULT_SCROLL_SCALE,
    DEFAULT_UR_PORT,
    DOMAIN,
    MEDIA_BUTTONS,
    UR_KEY_MAP,
)

_LOGGER = logging.getLogger(__name__)

WHEEL_DELTA = 120  # mirrors Windows WHEEL_DELTA; same unit used by UR


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register the WebSocket command once when the integration domain loads."""
    hass.data.setdefault(DOMAIN, {})
    websocket_api.async_register_command(hass, ws_handle_command)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Start a UnifiedRemoteClient for this config entry."""
    client = UnifiedRemoteClient(
        host=entry.data[CONF_UR_HOST],
        port=entry.data.get(CONF_UR_PORT, DEFAULT_UR_PORT),
        password=entry.data.get(CONF_UR_PASSWORD, ""),
        scroll_scale=entry.data.get(CONF_SCROLL_SCALE, DEFAULT_SCROLL_SCALE),
    )
    # start() spawns a daemon thread — safe to call in async context
    client.start()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = client

    _LOGGER.info(
        "Unified Remote: connecting to %s:%s",
        entry.data[CONF_UR_HOST],
        entry.data.get(CONF_UR_PORT, DEFAULT_UR_PORT),
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Stop the client when the entry is removed."""
    client: UnifiedRemoteClient = hass.data[DOMAIN].pop(entry.entry_id)
    # stop() joins the background thread — must run in executor
    await hass.async_add_executor_job(client.stop)
    return True


# ═══════════════════════════════════════════════════════════════════════════════
#  WebSocket command handler
# ═══════════════════════════════════════════════════════════════════════════════

@websocket_api.websocket_command(
    {
        vol.Required("type"): "unified_remote/command",
        # Common discriminator
        vol.Required("t"): str,
        # Mouse move / scroll deltas
        vol.Optional("dx"): vol.Any(vol.Coerce(float), None),
        vol.Optional("dy"): vol.Any(vol.Coerce(float), None),
        # Media / volume action strings
        vol.Optional("action"): str,
        # Keyboard
        vol.Optional("text"): str,
        vol.Optional("key"):  str,
    }
)
@websocket_api.async_response
async def ws_handle_command(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """
    Dispatch a unified_remote/command WebSocket message to the UR client.

    The card sends fire-and-forget style (never awaits the result).
    This handler dispatches immediately and replies with an empty result so
    HA's bookkeeping is satisfied and the card's promise resolves quickly.
    """
    clients: dict[str, UnifiedRemoteClient] = hass.data.get(DOMAIN, {})
    if not clients:
        connection.send_error(
            msg["id"], "not_found", "No Unified Remote integration configured"
        )
        return

    # Use the first (typically only) configured entry
    client = next(iter(clients.values()))

    # Dispatch to blocking UR send on a thread-pool worker so the async loop
    # is not blocked.  Reply immediately — don't wait for UR to echo back.
    await hass.async_add_executor_job(_dispatch, client, msg)
    connection.send_result(msg["id"])


def _dispatch(client: UnifiedRemoteClient, msg: dict[str, Any]) -> None:
    """Synchronous dispatch — runs in HA's executor thread pool."""
    _LOGGER.debug("Websocket msg dispatch: %s", msg)
    t = msg.get("t", "")

    # ── Mouse ──────────────────────────────────────────────────────────────────
    if t == "move":
        dx = float(msg.get("dx") or 0)
        dy = float(msg.get("dy") or 0)
        xi = int(round(dx)); yi = int(round(dy))
        if xi or yi:
            client.run_mouse_action("MoveBy", [("X", str(xi)), ("Y", str(yi))])

    elif t == "scroll":
        dx = float(msg.get("dx") or 0)
        dy = float(msg.get("dy") or 0)
        client.scroll_mouse(dx, dy)

    elif t == "click":
        client.run_mouse_action("Click", [("Button", "Left")])

    elif t == "right_click":
        client.run_mouse_action("Click", [("Button", "Right")])

    elif t == "double_click":
        client.run_mouse_action("Click", [("Button", "Left")])
        client.run_mouse_action("Click", [("Button", "Left")])

    elif t == "down":
        client.run_mouse_action("Down", [("Button", "Left")])

    elif t == "up":
        client.run_mouse_action("Up", [("Button", "Left")])

    # ── Keyboard ───────────────────────────────────────────────────────────────
    elif t == "text":
        text = msg.get("text", "")
        if text:
            # kb.text() equivalent — inferred from UR Lua API, not PCAP-verified
            client.run_keyboard_action("Text", [("Text", text)])

    elif t == "key":
        key = msg.get("key", "")
        ur_key = UR_KEY_MAP.get(key, key)
        if ur_key:
            # kb.press() equivalent — inferred from UR Lua API, not PCAP-verified
            client.run_keyboard_action("Press", [("Key", ur_key)])

    # ── Media / Volume ─────────────────────────────────────────────────────────
    elif t == "volume":
        action = msg.get("action", "")
        button_map = {
            "up":   "volume_up",
            "down": "volume_down",
            "mute": "volume_mute",
        }
        button = button_map.get(action)
        if button:
            client.run_action(REMOTE_MEDIA, button)

    elif t == "media":
        action = msg.get("action", "")
        button = MEDIA_BUTTONS.get(action)
        if button:
            client.run_action(REMOTE_MEDIA, button)

    else:
        _LOGGER.debug("Unknown command type: %s", t)
