import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fireEvent, HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import { HaFormSchema, UnifiedRemoteCardConfig } from './types';

const DEFAULT_FORM_VALUES: Partial<UnifiedRemoteCardConfig> = {
  show_lock: true,
  show_speed_buttons: true,
  show_status_text: true,
  show_volume_controls: true,
  show_media_controls: true,
  show_keyboard_button: true,
  invert_scroll: false,
};

const schema: HaFormSchema[] = [
  { name: 'show_lock',            type: 'boolean', default: true },
  { name: 'show_speed_buttons',   type: 'boolean', default: true },
  { name: 'show_status_text',     type: 'boolean', default: true },
  { name: 'show_volume_controls', type: 'boolean', default: true },
  { name: 'show_media_controls',  type: 'boolean', default: true },
  { name: 'show_keyboard_button', type: 'boolean', default: true },
  { name: 'sensitivity',          type: 'float',   required: false },
  { name: 'scroll_multiplier',    type: 'float',   required: false },
  { name: 'invert_scroll',        type: 'boolean', default: false },
  { name: 'double_tap_ms',        type: 'integer', required: false },
  { name: 'tap_suppression_px',   type: 'integer', required: false },
];

@customElement('unified-remote-card-editor')
export class UnifiedRemoteCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: UnifiedRemoteCardConfig;

  public setConfig(config: UnifiedRemoteCardConfig): void {
    this._config = { ...DEFAULT_FORM_VALUES, ...config };
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const detail = (ev.detail as { value?: Partial<UnifiedRemoteCardConfig> })?.value;
    if (!detail) return;

    const numericFields = new Set<keyof UnifiedRemoteCardConfig>(['sensitivity', 'scroll_multiplier', 'double_tap_ms', 'tap_suppression_px']);
    const cleaned: Partial<UnifiedRemoteCardConfig> = {};
    Object.entries(detail).forEach(([key, value]) => {
      const k = key as keyof UnifiedRemoteCardConfig;
      if (numericFields.has(k)) {
        if (value === '' || value === null || Number.isNaN(value as number)) {
          cleaned[k] = undefined;
          return;
        }
      }
      (cleaned as Record<string, unknown>)[k] = value;
    });

    this._config = { ...this._config, ...cleaned };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  private _computeLabel = (field: HaFormSchema): string => {
    switch (field.name) {
      case 'show_lock':            return 'Show LOCK button';
      case 'show_speed_buttons':   return 'Show speed multiplier buttons (×2 ×3 ×4)';
      case 'show_status_text':     return 'Show connection status text';
      case 'show_volume_controls': return 'Show volume controls (up / down / mute)';
      case 'show_media_controls':  return 'Show media controls bar (prev / play-pause / stop / next)';
      case 'show_keyboard_button': return 'Show keyboard toggle button';
      case 'sensitivity':          return 'Swipe sensitivity (default 1)';
      case 'scroll_multiplier':    return 'Scroll multiplier (default 1)';
      case 'invert_scroll':        return 'Reverse scroll direction';
      case 'double_tap_ms':        return 'Double-tap window in ms (default 250)';
      case 'tap_suppression_px':   return 'Max movement allowed for tap in px (default 6)';
      default:                     return String(field.name);
    }
  };

  protected render() {
    if (!this.hass) return html``;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${schema}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  static styles = css`
    ha-form { display: block; padding: 0; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'unified-remote-card-editor': UnifiedRemoteCardEditor;
  }
}
