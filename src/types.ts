import { LovelaceCardConfig } from 'custom-card-helpers';

export interface UnifiedRemoteCardConfig extends LovelaceCardConfig {
  type: string;
  // ── Touchpad ──────────────────────────────────────────────────────────────
  sensitivity?: number;
  scroll_multiplier?: number;
  invert_scroll?: boolean;
  double_tap_ms?: number;
  tap_suppression_px?: number;
  // ── UI toggles ────────────────────────────────────────────────────────────
  show_lock?: boolean;
  show_speed_buttons?: boolean;
  show_status_text?: boolean;
  show_volume_controls?: boolean;
  show_media_controls?: boolean;
  show_keyboard_button?: boolean;
  show_mouse_buttons?: boolean;
}

export type HaFormSchema =
  | { name: keyof UnifiedRemoteCardConfig; type: 'string'; required?: boolean; selector?: { select: { options: Array<{ value: string; label: string }> } } }
  | { name: keyof UnifiedRemoteCardConfig; type: 'boolean'; default?: boolean }
  | { name: keyof UnifiedRemoteCardConfig; type: 'float'; default?: number; required?: boolean }
  | { name: keyof UnifiedRemoteCardConfig; type: 'integer'; default?: number; required?: boolean };

export type KeyCommand =
  | 'enter'
  | 'backspace'
  | 'escape'
  | 'back'
  | 'tab'
  | 'space'
  | 'delete'
  | 'arrow_left'
  | 'arrow_right'
  | 'arrow_up'
  | 'arrow_down'
  | 'home'
  | 'end'
  | 'page_up'
  | 'page_down'
  | 'ctrl_alt_del';
export type VolumeAction = 'up' | 'down' | 'mute';

export type MediaAction = 'play_pause' | 'stop' | 'previous' | 'next';

/**
 * Commands sent from the Lovelace card to the HA integration via
 * hass.connection.sendMessagePromise({ type: 'unified_remote/command', ...cmd }).
 *
 * Mouse / keyboard → Unified Remote UDP (Relmtech.Basic Input)
 * Volume / media   → Unified Remote TCP (Unified.Media)
 */
export type URCommand =
  | { t: 'move'; dx: number; dy: number }
  | { t: 'scroll'; dx: number; dy: number }
  | { t: 'click' }
  | { t: 'double_click' }
  | { t: 'right_click' }
  | { t: 'down' }
  | { t: 'up' }
  | { t: 'text'; text: string }
  | { t: 'key'; key: KeyCommand }
  | { t: 'volume'; action: VolumeAction }
  | { t: 'media'; action: MediaAction };
