"""Config flow for Unified Remote integration."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult

from .client import UnifiedRemoteClient
from .const import (
    CONF_SCROLL_SCALE,
    CONF_UR_HOST,
    CONF_UR_PASSWORD,
    CONF_UR_PORT,
    DEFAULT_SCROLL_SCALE,
    DEFAULT_UR_PORT,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_UR_HOST): str,
        vol.Optional(CONF_UR_PORT, default=DEFAULT_UR_PORT): int,
        vol.Optional(CONF_UR_PASSWORD, default=""): str,
        vol.Optional(CONF_SCROLL_SCALE, default=DEFAULT_SCROLL_SCALE): vol.Coerce(float),
    }
)


async def _try_connect(hass: HomeAssistant, data: dict[str, Any]) -> bool:
    """Try to connect to Unified Remote server. Returns True on success."""

    def _connect() -> bool:
        client = UnifiedRemoteClient(
            data[CONF_UR_HOST],
            data.get(CONF_UR_PORT, DEFAULT_UR_PORT),
            data.get(CONF_UR_PASSWORD, ""),
        )
        client.start()
        try:
            return client.wait_ready(timeout=8.0)
        finally:
            client.stop()

    return await hass.async_add_executor_job(_connect)


class UnifiedRemoteConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Unified Remote."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            # Prevent duplicate entries for the same host
            await self.async_set_unique_id(
                f"{user_input[CONF_UR_HOST]}:{user_input.get(CONF_UR_PORT, DEFAULT_UR_PORT)}"
            )
            self._abort_if_unique_id_configured()

            try:
                connected = await _try_connect(self.hass, user_input)
                if connected:
                    return self.async_create_entry(
                        title=f"Unified Remote ({user_input[CONF_UR_HOST]})",
                        data=user_input,
                    )
                errors["base"] = "cannot_connect"
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Unexpected error connecting to Unified Remote")
                errors["base"] = "cannot_connect"

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_SCHEMA,
            errors=errors,
        )
