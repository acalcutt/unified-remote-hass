"""Media Player platform for Unified Remote."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.media_player import (
    MediaPlayerDeviceClass,
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.device_registry import DeviceInfo

from .client import REMOTE_MEDIA, UnifiedRemoteClient
from .const import DOMAIN, CONF_UR_HOST, CONF_NAME

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Unified Remote media player from a config entry."""
    client: UnifiedRemoteClient = hass.data[DOMAIN][entry.entry_id]
    name = entry.data.get(CONF_NAME) or entry.title or f"Unified Remote {entry.data.get(CONF_UR_HOST)}"

    async_add_entities([UnifiedRemoteMediaPlayer(client, name, entry.entry_id)])

class UnifiedRemoteMediaPlayer(MediaPlayerEntity):
    """Representation of a Unified Remote Media Player."""

    _attr_has_entity_name = True
    _attr_name = None  # Use device name
    _attr_device_class = MediaPlayerDeviceClass.SPEAKER
    _attr_supported_features = (
        MediaPlayerEntityFeature.PLAY
        | MediaPlayerEntityFeature.PAUSE
        | MediaPlayerEntityFeature.STOP
        | MediaPlayerEntityFeature.PREVIOUS_TRACK
        | MediaPlayerEntityFeature.NEXT_TRACK
        | MediaPlayerEntityFeature.VOLUME_STEP
        | MediaPlayerEntityFeature.VOLUME_MUTE
    )

    def __init__(self, client: UnifiedRemoteClient, name: str, entry_id: str) -> None:
        """Initialize the media player."""
        self._client = client
        self._attr_unique_id = f"{entry_id}_media"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry_id)},
            name=name,
            manufacturer="Unified Intents",
            model="Unified Remote Server",
        )

    @property
    def state(self) -> MediaPlayerState | None:
        """Return the state of the device.

        Since Unified Remote doesn't report its current media state (playing or paused),
        we'll just show it as PLAYING when connected so that all UI controls (like
        previous/next track) are fully visible in the Home Assistant dashboard.
        """
        if getattr(self._client, "is_connected", lambda: False)():
            return MediaPlayerState.PLAYING
        return MediaPlayerState.OFF

    def _execute_command(self, button: str) -> None:
        """Send a button command to the Unified.Media remote."""
        if not getattr(self._client, "is_connected", lambda: False)():
            _LOGGER.warning("Unified Remote not connected, cannot send %s", button)
            return
        
        self._client.run_action(REMOTE_MEDIA, button)

    def media_play(self) -> None:
        """Send play command."""
        self._execute_command("play_pause")

    def media_pause(self) -> None:
        """Send pause command."""
        self._execute_command("play_pause")

    def media_play_pause(self) -> None:
        """Send play/pause command."""
        self._execute_command("play_pause")

    def media_stop(self) -> None:
        """Send stop command."""
        self._execute_command("stop")

    def media_previous_track(self) -> None:
        """Send previous track command."""
        self._execute_command("previous")

    def media_next_track(self) -> None:
        """Send next track command."""
        self._execute_command("next")

    def volume_up(self) -> None:
        """Send volume up command."""
        self._execute_command("volume_up")

    def volume_down(self) -> None:
        """Send volume down command."""
        self._execute_command("volume_down")

    def mute_volume(self, mute: bool) -> None:
        """Send mute command. UR only toggles mute, so we just send volume_mute ignoring 'mute' arg."""
        self._execute_command("volume_mute")

    async def async_update(self) -> None:
        """Update state. We just rely on client connection state."""
        # This will naturally trigger a state update via the `state` property logic.
        pass