/**
 * unified-remote-card.ts
 *
 * Home Assistant Lovelace card for Unified Remote.
 * Provides a touchpad, media controls, volume controls, and keyboard panel.
 *
 * Touchpad gesture handling and UI structure are adapted from
 * lovelace-touchpad-card (https://github.com/michalowskil/lovelace-touchpad-card)
 * by michalowskil, licensed CC BY-NC-ND 4.0.
 * Adaptations: replaced WebSocket message routing for Unified Remote bridge,
 * added media control bar, removed webOS backend, updated config schema.
 */

import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import { URCommand, KeyCommand, MediaAction, UnifiedRemoteCardConfig, VolumeAction } from './types';
import './unified-remote-card-editor';

type PointerGesture = 'move' | 'scroll' | null;

interface PointerState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
}

interface LockedPanState {
  id: number;
  lastY: number;
}

const HOLD_DELAY_MS = 320;
const HOLD_CANCEL_PX = 3;

const LOG_PREFIX = 'UNIFIED-REMOTE-CARD';
const LOG_TAG_STYLE = 'background:#1565c0;color:#fff;font-weight:700;padding:2px 6px;border-radius:6px;';
const LOG_TEXT_STYLE = 'color:#1565c0;font-weight:600;';

function logError(message: string, detail?: unknown): void {
  const label = `%c${LOG_PREFIX}%c ${message}`;
  if (detail !== undefined) {
    console.groupCollapsed(label, LOG_TAG_STYLE, LOG_TEXT_STYLE);
    console.log(detail);
    console.trace();
    console.groupEnd();
    return;
  }
  console.error(label, LOG_TAG_STYLE, LOG_TEXT_STYLE);
}

function logWarn(message: string, detail?: unknown): void {
  const label = `%c${LOG_PREFIX}%c ${message}`;
  if (detail !== undefined) {
    console.groupCollapsed(label, LOG_TAG_STYLE, LOG_TEXT_STYLE);
    console.warn(detail);
    console.groupEnd();
    return;
  }
  console.warn(label, LOG_TAG_STYLE, LOG_TEXT_STYLE);
}

const DEFAULTS = {
  sensitivity: 1,
  scrollMultiplier: 1,
  invertScroll: false,
  doubleTapMs: 250,
  tapSuppressionPx: 6,
  showLock: true,
  showSpeedButtons: true,
  showStatusText: true,
  showVolumeControls: true,
  showMediaControls: true,
  showKeyboardButton: true,
};

@customElement('unified-remote-card')
export class UnifiedRemoteCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: UnifiedRemoteCardConfig;
  @state() private _status: 'disconnected' | 'connected' = 'disconnected';
  @state() private _statusDisplay: 'disconnected' | 'connected' = 'disconnected';
  @state() private _locked = false;
  @state() private _speedMultiplier: 1 | 2 | 3 | 4 = 1;
  @state() private _keyboardOpen = false;

  private rafHandle?: number;
  private statusTimer?: number;

  // Pointer tracking
  private pointers = new Map<number, PointerState>();
  private gesture: PointerGesture = null;
  private moveAccum = { x: 0, y: 0 };
  private scrollAccum = { x: 0, y: 0 };
  private lastTapTime = 0;
  private tapTimer?: number;
  private holdTimer?: number;
  private dragLocked: boolean = false;
  private lockedPan?: LockedPanState;

  private opts = { ...DEFAULTS };

  // ── Card registration ───────────────────────────────────────────────────────

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('unified-remote-card-editor');
  }

  public static getStubConfig(): UnifiedRemoteCardConfig {
    return {
      type: 'custom:unified-remote-card',
      show_lock: DEFAULTS.showLock,
      show_speed_buttons: DEFAULTS.showSpeedButtons,
      show_status_text: DEFAULTS.showStatusText,
      show_volume_controls: DEFAULTS.showVolumeControls,
      show_media_controls: DEFAULTS.showMediaControls,
      show_keyboard_button: DEFAULTS.showKeyboardButton,
    };
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  public setConfig(config: UnifiedRemoteCardConfig): void {
    this._config = config;
    this.opts = {
      sensitivity: config.sensitivity ?? DEFAULTS.sensitivity,
      scrollMultiplier: config.scroll_multiplier ?? DEFAULTS.scrollMultiplier,
      invertScroll: config.invert_scroll ?? DEFAULTS.invertScroll,
      doubleTapMs: config.double_tap_ms ?? DEFAULTS.doubleTapMs,
      tapSuppressionPx: config.tap_suppression_px ?? DEFAULTS.tapSuppressionPx,
      showLock: config.show_lock ?? DEFAULTS.showLock,
      showSpeedButtons: config.show_speed_buttons ?? DEFAULTS.showSpeedButtons,
      showStatusText: config.show_status_text ?? DEFAULTS.showStatusText,
      showVolumeControls: config.show_volume_controls ?? DEFAULTS.showVolumeControls,
      showMediaControls: config.show_media_controls ?? DEFAULTS.showMediaControls,
      showKeyboardButton: config.show_keyboard_button ?? DEFAULTS.showKeyboardButton,
    };

    this._locked = false;
    this._keyboardOpen = false;
    this._speedMultiplier = 1;
    this.restoreUiState();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  public connectedCallback(): void {
    super.connectedCallback();
    // Status reflects hass availability; update when card is (re-)attached
    this.setStatus(this.hass ? 'connected' : 'disconnected');
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const timer of [this.tapTimer, this.statusTimer, this.holdTimer]) {
      if (timer) clearTimeout(timer);
    }
    this.tapTimer = this.statusTimer = this.holdTimer = undefined;

    if (this.dragLocked) {
      this.sendButton('up');
      this.dragLocked = false;
    }
  }

  // ── HA connection ───────────────────────────────────────────────────────────

  // hass property is managed by HA; we react to it to update status
  protected updated(changedProps: Map<string, unknown>): void {
    super.updated(changedProps);
    if (changedProps.has('hass')) {
      this.setStatus(this.hass ? 'connected' : 'disconnected');
    }
  }

  // ── UI state persistence ────────────────────────────────────────────────────

  private storageAvailable(): Storage | null {
    try {
      const store = window.localStorage;
      const probe = '__ur_card_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch {
      return null;
    }
  }

  private persistenceKey(): string | null {
    if (!this._config) return null;
    const viewId = window?.location?.pathname ?? '';
    return `unified-remote-card:ha:${viewId}`;
  }

  private restoreUiState(): void {
    const store = this.storageAvailable();
    const key = this.persistenceKey();
    if (!store || !key) return;
    try {
      const raw = store.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{ locked: boolean; speedMultiplier: number; keyboardOpen: boolean }>;
      if (typeof parsed.locked === 'boolean') this._locked = parsed.locked;
      if (parsed.speedMultiplier === 1 || parsed.speedMultiplier === 2 || parsed.speedMultiplier === 3 || parsed.speedMultiplier === 4) {
        this._speedMultiplier = parsed.speedMultiplier;
      }
      if (typeof parsed.keyboardOpen === 'boolean' && this.opts.showKeyboardButton) {
        this._keyboardOpen = parsed.keyboardOpen;
      }
    } catch (err) {
      logWarn('Failed to restore UI state.', err);
    }
  }

  private persistUiState(): void {
    const store = this.storageAvailable();
    const key = this.persistenceKey();
    if (!store || !key) return;
    try {
      store.setItem(key, JSON.stringify({
        locked: this._locked,
        speedMultiplier: this._speedMultiplier,
        keyboardOpen: this.opts.showKeyboardButton ? this._keyboardOpen : false,
      }));
    } catch (err) {
      logWarn('Failed to persist UI state.', err);
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  private setStatus(next: 'disconnected' | 'connected'): void {
    this._status = next;
    if (this.statusTimer) { clearTimeout(this.statusTimer); this.statusTimer = undefined; }

    if (next === 'connected') {
      this._statusDisplay = next;
      return;
    }
    // Debounce transient disconnects
    this.statusTimer = window.setTimeout(() => {
      this._statusDisplay = next;
      this.statusTimer = undefined;
    }, 600);
  }

  private statusLabel(): string {
    switch (this._statusDisplay) {
      case 'connected':  return 'PC Connected';
      default:           return 'PC Disconnected';
    }
  }

  // ── Pointer helpers ─────────────────────────────────────────────────────────

  private get captureLayer(): HTMLElement | null {
    return this.renderRoot.querySelector('.capture');
  }

  private centroid(): { x: number; y: number } {
    if (this.pointers.size === 0) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    this.pointers.forEach((p) => { sx += p.x; sy += p.y; });
    const c = this.pointers.size;
    return { x: sx / c, y: sy / c };
  }

  // ── Pointer event handlers ──────────────────────────────────────────────────

  private handlePointerDown = (ev: PointerEvent): void => {
    if (this._locked) { this.startLockedPan(ev); return; }
    ev.preventDefault();
    this.captureLayer?.setPointerCapture(ev.pointerId);

    // blur the keyboard input so mobile keyboards close when touching the trackpad
    const kbInput = this.renderRoot?.querySelector('.keyboard-input') as HTMLInputElement | null;
    if (kbInput && document.activeElement !== document.body) {
      kbInput.blur();
    }

    const now = performance.now();
    this.pointers.set(ev.pointerId, {
      id: ev.pointerId,
      x: ev.clientX, y: ev.clientY,
      startX: ev.clientX, startY: ev.clientY,
      startTime: now,
    });

    if (this.pointers.size === 1) {
      this.gesture = 'move';
      this.startHoldTimer(ev);
    } else if (this.pointers.size >= 2) {
      this.cancelHoldTimer();
      this.endDragIfNeeded();
      this.gesture = 'scroll';
    }
  };

  private handlePointerMove = (ev: PointerEvent): void => {
    if (this._locked) { this.moveLockedPan(ev); return; }
    const pointer = this.pointers.get(ev.pointerId);
    if (!pointer) return;
    ev.preventDefault();

    const before = this.centroid();
    pointer.x = ev.clientX;
    pointer.y = ev.clientY;
    this.pointers.set(ev.pointerId, pointer);
    const after = this.centroid();

    const distFromStart = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (this.holdTimer && distFromStart > HOLD_CANCEL_PX) this.cancelHoldTimer();

    if (this.pointers.size >= 2) {
      this.cancelHoldTimer();
      this.endDragIfNeeded();
      this.gesture = 'scroll';
    }

    if (this.gesture === 'move' && this.pointers.size === 1) {
      const mult = this.opts.sensitivity * this._speedMultiplier;
      this.moveAccum.x += (after.x - before.x) * mult;
      this.moveAccum.y += (after.y - before.y) * mult;
      this.queueSend();
    } else if (this.gesture === 'scroll' && this.pointers.size >= 2) {
      const dir = this.opts.invertScroll ? -1 : 1;
      this.scrollAccum.x += (after.x - before.x) * this.opts.scrollMultiplier * dir;
      this.scrollAccum.y += (after.y - before.y) * this.opts.scrollMultiplier * dir;
      this.queueSend();
    }
  };

  private handlePointerUp = (ev: PointerEvent): void => {
    if (this._locked) { this.endLockedPan(ev); return; }
    const pointer = this.pointers.get(ev.pointerId);
    if (!pointer) return;
    ev.preventDefault();

    const wasDragging = this.dragLocked;
    this.cancelHoldTimer();

    const beforeCount = this.pointers.size;
    const now = performance.now();
    const dist = Math.hypot(ev.clientX - pointer.startX, ev.clientY - pointer.startY);
    const duration = now - pointer.startTime;
    this.pointers.delete(ev.pointerId);

    if (beforeCount === 2) {
      const remaining = [...this.pointers.values()][0];
      if (remaining) {
        const distOther = Math.hypot(remaining.x - remaining.startX, remaining.y - remaining.startY);
        const elapsed = now - Math.min(pointer.startTime, remaining.startTime);
        if (dist <= this.opts.tapSuppressionPx && distOther <= this.opts.tapSuppressionPx && elapsed <= this.opts.doubleTapMs) {
          this.sendTap('right_click');
          this.pointers.clear();
          this.gesture = null;
          return;
        }
      }
    }

    if (this.pointers.size === 0) {
      const isTap = this.gesture === 'move' && dist <= this.opts.tapSuppressionPx && duration <= this.opts.doubleTapMs;

      if (wasDragging && isTap) {
        this.sendButton('up');
        this.dragLocked = false;
        this.gesture = null;
        return;
      }

      if (!wasDragging && isTap) {
        if (this.tapTimer) { clearTimeout(this.tapTimer); this.tapTimer = undefined; }

        if (now - this.lastTapTime <= this.opts.doubleTapMs) {
          this.sendTap('double_click');
          this.lastTapTime = 0;
        } else {
          this.lastTapTime = now;
          this.tapTimer = window.setTimeout(() => {
            this.sendTap('click');
            this.lastTapTime = 0;
            this.tapTimer = undefined;
          }, this.opts.doubleTapMs);
        }
      }
      this.gesture = null;
    } else if (this.pointers.size === 1 && this.gesture === 'scroll') {
      this.gesture = 'move';
    }
  };

  private handlePointerCancel = (ev: PointerEvent): void => {
    if (this._locked) { this.endLockedPan(ev); return; }
    this.pointers.delete(ev.pointerId);
    if (this.dragLocked) {
      this.sendButton('up');
      this.dragLocked = false;
    }
    this.cancelHoldTimer();
    if (this.pointers.size === 0) this.gesture = null;
  };

  // ── Locked scroll mode ──────────────────────────────────────────────────────

  private startLockedPan(ev: PointerEvent): void {
    if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;
    this.captureLayer?.setPointerCapture(ev.pointerId);
    this.lockedPan = { id: ev.pointerId, lastY: ev.clientY };
  }

  private moveLockedPan(ev: PointerEvent): void {
    if (!this.lockedPan || this.lockedPan.id !== ev.pointerId) return;
    if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;
    ev.preventDefault();
    const deltaY = ev.clientY - this.lockedPan.lastY;
    if (deltaY !== 0) {
      window.scrollBy({ top: -deltaY, behavior: 'auto' });
      this.lockedPan.lastY = ev.clientY;
    }
  }

  private endLockedPan(ev: PointerEvent): void {
    if (this.lockedPan?.id === ev.pointerId) this.lockedPan = undefined;
    if (this.captureLayer?.hasPointerCapture?.(ev.pointerId)) {
      this.captureLayer.releasePointerCapture(ev.pointerId);
    }
  }

  // ── Hold timer (drag mode) ──────────────────────────────────────────────────

  private startHoldTimer(ev: PointerEvent): void {
    if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;
    this.cancelHoldTimer();
    this.holdTimer = window.setTimeout(() => {
      const pointer = this.pointers.get(ev.pointerId);
      if (!pointer) return;
      const dist = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
      if (this.pointers.size === 1 && this.gesture === 'move' && !this.dragLocked && dist <= HOLD_CANCEL_PX) {
        this.dragLocked = true;
        this.sendButton('down');
        if (navigator?.vibrate) navigator.vibrate(15);
      }
      this.holdTimer = undefined;
    }, HOLD_DELAY_MS);
  }

  private cancelHoldTimer(): void {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = undefined; }
  }

  private endDragIfNeeded(pointerId?: number): void {
    if (!this.dragLocked) return;
    if (pointerId == null || this.dragPointerId === pointerId) {
      this.sendButton('up');
      this.dragLocked = false;
    }
  }

  // ── Batched send (rAF-coalesced) ────────────────────────────────────────────

  private queueSend(): void {
    if (this.rafHandle != null) return;
    this.rafHandle = window.requestAnimationFrame(() => {
      this.rafHandle = undefined;
      this.flush();
    });
  }

  private flush(): void {
    if (!this.hass) {
      this.moveAccum = { x: 0, y: 0 };
      this.scrollAccum = { x: 0, y: 0 };
      return;
    }

    if (Math.abs(this.moveAccum.x) > 0 || Math.abs(this.moveAccum.y) > 0) {
      this.send({ t: 'move', dx: this.moveAccum.x, dy: this.moveAccum.y });
      this.moveAccum = { x: 0, y: 0 };
    }
    if (Math.abs(this.scrollAccum.x) > 0 || Math.abs(this.scrollAccum.y) > 0) {
      this.send({ t: 'scroll', dx: this.scrollAccum.x, dy: this.scrollAccum.y });
      this.scrollAccum = { x: 0, y: 0 };
    }
  }

  // ── Message senders ─────────────────────────────────────────────────────────

  private send(cmd: URCommand): void {
    if (!this.hass) return;
    // Fire-and-forget: don't await the result.
    // HA integration responds immediately after dispatching to the UR client.
    (this.hass.connection.sendMessagePromise({
      type: 'unified_remote/command',
      ...cmd,
    }) as Promise<unknown>).catch(() => {});
  }

  private sendTap(kind: 'click' | 'double_click' | 'right_click'): void {
    this.send({ t: kind });
  }

  private sendButton(kind: 'down' | 'up'): void {
    this.send({ t: kind });
  }

  private sendKey(key: KeyCommand): void {
    this.send({ t: 'key', key });
  }

  private sendText(text: string): void {
    if (!text) return;
    this.send({ t: 'text', text });
  }

  private sendVolume(action: VolumeAction): void {
    this.send({ t: 'volume', action });
  }

  private sendMedia(action: MediaAction): void {
    this.send({ t: 'media', action });
  }

  // ── Keyboard handlers ───────────────────────────────────────────────────────

  private handleKeyboardInput = (ev: InputEvent): void => {
    const target = ev.target as HTMLInputElement;
    const inputType = ev.inputType;
    const data = ev.data ?? '';

    if (inputType === 'insertText' && data) {
      this.sendText(data);
    } else if (inputType === 'insertLineBreak') {
      this.sendKey('enter');
    } else if (inputType === 'insertFromPaste') {
      const pasted = typeof data === 'string' && data ? data : target.value;
      if (pasted) this.sendText(pasted);
    }
  };

  private handleKeyboardKeydown = (ev: KeyboardEvent): void => {
    const mapped = this.mapKey(ev.key);
    if (mapped) {
      if (mapped !== 'backspace' && mapped !== 'delete') ev.preventDefault();
      this.sendKey(mapped);
      return;
    }
    if (ev.key === 'AudioVolumeUp'   || ev.key === 'VolumeUp')   { ev.preventDefault(); this.sendVolume('up');   return; }
    if (ev.key === 'AudioVolumeDown' || ev.key === 'VolumeDown') { ev.preventDefault(); this.sendVolume('down'); return; }
    if (ev.key === 'AudioVolumeMute' || ev.key === 'VolumeMute') { ev.preventDefault(); this.sendVolume('mute'); }
  };

  private mapKey(key: string): KeyCommand | null {
    switch (key) {
      case 'Enter':      return 'enter';
      case 'Backspace':  return 'backspace';
      case 'Escape':     return 'escape';
      case 'Tab':        return 'tab';
      case 'Delete':     return 'delete';
      case ' ':
      case 'Spacebar':   return 'space';
      case 'ArrowLeft':  return 'arrow_left';
      case 'ArrowRight': return 'arrow_right';
      case 'ArrowUp':    return 'arrow_up';
      case 'ArrowDown':  return 'arrow_down';
      case 'Home':       return 'home';
      case 'End':        return 'end';
      case 'PageUp':     return 'page_up';
      case 'PageDown':   return 'page_down';
      default:           return null;
    }
  }

  // ── Toggle controls ─────────────────────────────────────────────────────────

  private toggleLock = (): void => {
    if (!this._locked && this.dragLocked) {
      this.sendButton('up');
      this.dragLocked = false;
    }
    this.cancelHoldTimer();
    this.lockedPan = undefined;
    this._locked = !this._locked;
    this.persistUiState();
  };

  private toggleKeyboardPanel = (): void => {
    if (!this.opts.showKeyboardButton) return;
    this._keyboardOpen = !this._keyboardOpen;
    this.persistUiState();
    if (this._keyboardOpen) {
      window.setTimeout(() => {
        const input = this.renderRoot?.querySelector('.keyboard-input') as HTMLInputElement | null;
        input?.focus();
      }, 0);
    }
  };

  private toggleSpeed(mult: 2 | 3 | 4): void {
    this._speedMultiplier = this._speedMultiplier === mult ? 1 : mult;
    this.persistUiState();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  protected render() {
    if (!this._config) return nothing;

    const showKeyboardSection = this.opts.showKeyboardButton && this._keyboardOpen;

    const arrowButtons = [
      { label: '↑', key: 'arrow_up'    as KeyCommand, cls: 'arrow-up',    title: 'Arrow up' },
      { label: '←', key: 'arrow_left'  as KeyCommand, cls: 'arrow-left',  title: 'Arrow left' },
      { label: '↓', key: 'arrow_down'  as KeyCommand, cls: 'arrow-down',  title: 'Arrow down' },
      { label: '→', key: 'arrow_right' as KeyCommand, cls: 'arrow-right', title: 'Arrow right' },
    ];

    const kbButtons = [
      { label: 'Tab',    key: 'tab'       as KeyCommand },
      { label: 'Esc',    key: 'escape'    as KeyCommand },
      { label: 'Del',    key: 'delete'    as KeyCommand },
      { label: 'Home',   key: 'home'      as KeyCommand },
      { label: 'End',    key: 'end'       as KeyCommand },
      { label: 'PgUp',   key: 'page_up'   as KeyCommand },
      { label: 'PgDn',   key: 'page_down' as KeyCommand },
      { label: 'Ctrl+Alt+Del', key: 'ctrl_alt_del' as KeyCommand },
    ];

    return html`
      <ha-card @contextmenu=${(e: Event) => e.preventDefault()}>
        <!-- ── Touchpad surface ── -->
        <div class="surface ${this._locked ? 'locked' : ''} ${showKeyboardSection ? 'with-keyboard' : ''}">

          ${this.opts.showSpeedButtons ? html`
            <div class="speed-buttons">
              ${([2, 3, 4] as const).map((mult) => html`
                <button class="speed ${this._speedMultiplier === mult ? 'active' : ''}"
                        @click=${(e: Event) => { e.stopPropagation(); this.toggleSpeed(mult); }}>
                  &times;${mult}
                </button>`)}
            </div>` : nothing}

          ${this.opts.showLock ? html`
            <button class="lock ${this._locked ? 'active' : ''}"
                    @click=${(e: Event) => { e.stopPropagation(); this.toggleLock(); }}>
              LOCK
            </button>` : nothing}

          ${this.opts.showVolumeControls ? html`
            <div class="side-stack right">
              <button class="icon-btn" title="Volume up"   @click=${() => this.sendVolume('up')}>
                <ha-icon icon="mdi:volume-plus"></ha-icon>
              </button>
              <button class="icon-btn" title="Volume down" @click=${() => this.sendVolume('down')}>
                <ha-icon icon="mdi:volume-minus"></ha-icon>
              </button>
              <button class="icon-btn" title="Mute"        @click=${() => this.sendVolume('mute')}>
                <ha-icon icon="mdi:volume-mute"></ha-icon>
              </button>
            </div>` : nothing}

          ${this.opts.showKeyboardButton ? html`
            <button class="keyboard-toggle ${this._keyboardOpen ? 'active' : ''}"
                    title="Keyboard"
                    @click=${this.toggleKeyboardPanel}>
              <ha-icon icon="mdi:keyboard-outline"></ha-icon>
            </button>` : nothing}

          <!-- capture layer — receives all pointer events -->
          <div class="capture"
               @mousedown=${(e: Event) => { if ((e as any).detail > 1) e.preventDefault(); }}
               @dblclick=${(e: Event) => e.preventDefault()}
               @pointerdown=${this.handlePointerDown}
               @pointermove=${this.handlePointerMove}
               @pointerup=${this.handlePointerUp}
               @pointercancel=${this.handlePointerCancel}
               @pointerleave=${this.handlePointerCancel}
               @pointerout=${this.handlePointerCancel}>
          </div>

          ${this.opts.showStatusText ? html`
            <div class="status">
              ${this.statusLabel()}${this._locked ? ' (Locked)' : ''}
            </div>` : nothing}
        </div>

        <!-- ── Media controls bar ── -->
        ${this.opts.showMediaControls ? html`
          <div class="media-bar">
            <button class="media-btn" title="Previous"   @click=${() => this.sendMedia('previous')}>
              <ha-icon icon="mdi:skip-previous"></ha-icon>
            </button>
            <button class="media-btn" title="Play / Pause" @click=${() => this.sendMedia('play_pause')}>
              <ha-icon icon="mdi:play-pause"></ha-icon>
            </button>
            <button class="media-btn" title="Stop"       @click=${() => this.sendMedia('stop')}>
              <ha-icon icon="mdi:stop"></ha-icon>
            </button>
            <button class="media-btn" title="Next"       @click=${() => this.sendMedia('next')}>
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </button>
          </div>` : nothing}

        <!-- ── Keyboard panel ── -->
        ${showKeyboardSection ? html`
          <div class="controls">
            <div class="left-panel">
              <input class="keyboard-input"
                     type="text"
                     inputmode="text"
                     autocomplete="off"
                     autocorrect="off"
                     autocapitalize="none"
                     spellcheck="false"
                     placeholder="Tap to type on PC"
                     @input=${this.handleKeyboardInput}
                     @keydown=${this.handleKeyboardKeydown} />
              ${kbButtons.map((btn) => html`
                <button class="pill" @click=${() => this.sendKey(btn.key)}>${btn.label}</button>`)}
            </div>
            <div class="right-panel">
              ${arrowButtons.map((btn) => html`
                <button class="pill arrow ${btn.cls}"
                        @click=${() => this.sendKey(btn.key)}
                        title=${btn.title}>
                  ${btn.label}
                </button>`)}
            </div>
          </div>` : nothing}
      </ha-card>
    `;
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  static styles = css`
    :host {
      display: block;
      --control-height: 36px;
      --arrow-size: var(--control-height);
      --arrow-gap: 8px;
      --arrow-cluster-width: calc(var(--arrow-size) * 3 + var(--arrow-gap) * 2);
    }

    ha-card { overflow: hidden; }

    /* ── Touchpad surface ── */
    .surface {
      position: relative;
      height: 280px;
      background: linear-gradient(135deg, #1f2736, #2a3347);
      border-radius: 12px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
      color: #f5f5f5;
      user-select: none;
      touch-action: none;
    }

    .surface.with-keyboard {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    .surface.locked { touch-action: pan-y; }

    .capture {
      position: absolute;
      inset: 0;
      touch-action: none;
      z-index: 1;
    }

    /* ── Speed buttons ── */
    .speed-buttons {
      position: absolute;
      top: 10px;
      left: 14px;
      display: flex;
      gap: 8px;
      z-index: 2;
    }

    .speed {
      font-size: 12px;
      letter-spacing: 0.08em;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      color: #9ea7b7;
      padding: 6px 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .speed.active {
      color: #ff9800;
      border-color: rgba(255,152,0,0.5);
      box-shadow: 0 0 0 1px rgba(255,152,0,0.2);
    }

    /* ── Lock button ── */
    .lock {
      position: absolute;
      top: 10px;
      right: 14px;
      z-index: 2;
      font-size: 12px;
      letter-spacing: 0.12em;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      color: #9ea7b7;
      padding: 6px 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .lock.active {
      color: #ff9800;
      border-color: rgba(255,152,0,0.5);
      box-shadow: 0 0 0 1px rgba(255,152,0,0.2);
    }

    /* ── Side icon stacks (volume) ── */
    .side-stack {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 3;
    }

    .side-stack.right { right: 12px; }

    .icon-btn {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.04);
      color: #e5ecff;
      cursor: pointer;
      font-size: 16px;
      transition: all 140ms ease;
    }

    .icon-btn:hover {
      border-color: rgba(255,255,255,0.32);
      background: rgba(255,255,255,0.12);
    }

    .icon-btn:active { transform: scale(0.96); }

    /* ── Keyboard toggle ── */
    .keyboard-toggle {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 3;
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.05);
      color: #9ea7b7;
      cursor: pointer;
      font-size: 17px;
      transition: all 140ms ease;
    }

    .keyboard-toggle:hover { border-color: rgba(255,255,255,0.32); color: #e5ecff; }

    .keyboard-toggle.active {
      color: #ff9800;
      border-color: rgba(255,152,0,0.5);
      box-shadow: 0 0 0 1px rgba(255,152,0,0.2);
    }

    .icon-btn ha-icon, .keyboard-toggle ha-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: inherit;
      --mdc-icon-size: 20px;
    }

    /* ── Status text ── */
    .status {
      position: absolute;
      left: 14px;
      bottom: 12px;
      font-size: 13px;
      color: rgba(255,255,255,0.7);
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      pointer-events: none;
    }

    /* ── Media controls bar ── */
    .media-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 14px;
      background: #161c29;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .media-btn {
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.04);
      color: #e5ecff;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .media-btn:hover {
      border-color: rgba(255,255,255,0.32);
      background: rgba(255,255,255,0.12);
    }

    .media-btn:active { transform: scale(0.94); }

    .media-btn ha-icon {
      width: 22px;
      height: 22px;
      color: inherit;
      --mdc-icon-size: 22px;
    }

    /* ── Keyboard panel ── */
    .controls {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 12px 14px 14px;
      background: #161c29;
      border-top: 1px solid rgba(255,255,255,0.06);
      border-bottom-left-radius: 12px;
      border-bottom-right-radius: 12px;
    }

    .left-panel {
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
    }

    .left-panel .keyboard-input {
      flex: 1 1 100%;
      min-width: 0;
      height: var(--control-height);
      box-sizing: border-box;
      padding: 0 10px;
    }

    .left-panel .pill { flex: 0 0 auto; height: var(--control-height); padding: 0 12px; }

    .right-panel {
      flex: 0 0 var(--arrow-cluster-width);
      display: grid;
      grid-template-columns: repeat(3, var(--arrow-size));
      grid-template-rows: repeat(2, var(--arrow-size));
      gap: var(--arrow-gap);
      justify-items: center;
      align-items: center;
      margin-left: 10px;
      align-self: flex-start;
    }

    .pill.arrow {
      width: var(--arrow-size);
      height: var(--arrow-size);
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    .arrow-up    { grid-column: 2; grid-row: 1; }
    .arrow-left  { grid-column: 1; grid-row: 2; }
    .arrow-down  { grid-column: 2; grid-row: 2; }
    .arrow-right { grid-column: 3; grid-row: 2; }

    .pill {
      padding: 8px 12px;
      font-size: 13px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.05);
      color: #e5ecff;
      cursor: pointer;
      transition: all 140ms ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .pill:hover { border-color: rgba(255,255,255,0.32); background: rgba(255,255,255,0.12); }

    .keyboard-input {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      color: #f5f5f5;
      font-size: 14px;
      outline: none;
    }

    .keyboard-input:focus {
      border-color: rgba(255,255,255,0.32);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.08);
    }
  `;
}

// ── Global card registry ────────────────────────────────────────────────────

declare global {
  interface HTMLElementTagNameMap {
    'unified-remote-card': UnifiedRemoteCard;
  }
  interface Window {
    customCards?: Array<{ type: string; name: string; description: string }>;
  }
}

window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === 'unified-remote-card')) {
  window.customCards.push({
    type: 'unified-remote-card',
    name: 'Unified Remote Card',
    description: 'Control your PC from Home Assistant — touchpad, media controls, keyboard, and volume via Unified Remote.',
  });
}
