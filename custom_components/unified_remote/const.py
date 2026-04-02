"""Constants for the Unified Remote integration."""

DOMAIN = "unified_remote"

CONF_UR_HOST      = "ur_host"
CONF_UR_PORT      = "ur_port"
CONF_UR_PASSWORD  = "ur_password"
CONF_SCROLL_SCALE = "scroll_scale"

DEFAULT_UR_PORT      = 9512
DEFAULT_SCROLL_SCALE = 4.0

# UR key name mapping: card key name → Unified Remote key name
# Ref: Docs/res/keys.md
UR_KEY_MAP: dict[str, str] = {
    "enter":        "return",
    "backspace":    "back",
    "escape":       "escape",
    "tab":          "tab",
    "space":        "space",
    "delete":       "delete",
    "arrow_left":   "left",
    "arrow_right":  "right",
    "arrow_up":     "up",
    "arrow_down":   "down",
    "home":         "home",
    "end":          "end",
    "page_up":      "prior",
    "page_down":    "next",
    "back":         "browser_back",
}

# Media button names for Unified.Media remote (PCAP-verified)
MEDIA_BUTTONS: dict[str, str] = {
    "play_pause": "play_pause",
    "stop":       "stop",
    "previous":   "previous",
    "next":       "next",
    "volume_up":  "volume_up",
    "volume_down":"volume_down",
    "mute":       "volume_mute",
}
