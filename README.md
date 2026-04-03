# Unified Remote for Home Assistant

Control your Windows PC from Home Assistant with a touchpad, media controls, keyboard, and volume — powered by your existing **Unified Remote** server.

## Overview

This project has two parts:

| Part | What it does |
|------|-------------|
| **HA Integration** (`custom_components/unified_remote/`) | Custom HA integration — connects directly to Unified Remote Server over TCP/UDP from HA |
| **Lovelace Card** (`dist/unified-remote-card.js`) | Custom HA dashboard card — touchpad, media bar, keyboard panel, volume buttons |

```
HA Dashboard Card ──(HA native WebSocket)──► HA Integration (on HA host)
                                                      │
                                    ┌─────────────────┴──────────────────┐
                                    ▼                                      ▼
                           Unified Remote UDP :9512              Unified Remote TCP :9512
                           Relmtech.Basic Input                  Unified.Media
                           (mouse/keyboard)                      (media/volume)
```

The card communicates via HA's **built-in** WebSocket connection — no separate Python bridge or extra ports needed.  
The integration runs on your HA host and forwards commands to the Unified Remote Server on your Windows PC.

### Attribution

Touchpad gesture handling and UI structure adapted from  
[lovelace-touchpad-card](https://github.com/michalowskil/lovelace-touchpad-card) by michalowskil (CC BY-NC-ND 4.0).  
Modifications: replaced WebSocket backend routing for Unified Remote, added media control bar, updated config schema.

---

## Features

- **One-finger swipe** → mouse move  
- **Tap** → left click &nbsp;|&nbsp; **Double-tap** → double click  
- **Two-finger tap** → right click  
- **Press-and-hold then drag** → click-drag / select  
- **Two-finger swipe** → scroll (vertical or horizontal)  
- **Media bar** — ⏮ Previous / ⏯ Play-Pause / ⏹ Stop / ⏭ Next (via Unified Remote)  
- **Volume** — Up / Down / Mute (via Unified Remote)  
- **Keyboard panel** — text input, arrow keys, Tab/Esc/Del/Home/End/PgUp/PgDn, Ctrl+Alt+Del  
- **Speed multipliers** × 2 / × 3 / × 4  
- **Lock mode** — disables touch so you can scroll the HA page normally  
- Remembers lock, speed, and keyboard state per view  

---

## Requirements

- **Windows PC** with [Unified Remote Server](https://www.unifiedremote.com/) installed and running  
- **Home Assistant** with a Lovelace dashboard  
- HA host must be able to reach the Windows PC on port **9512** (TCP + UDP)  

---

## Installation

### 1 — Install the HA integration

Copy the `custom_components/unified_remote/` folder to your HA config directory:

```
<HA config dir>/
  custom_components/
    unified_remote/
      __init__.py
      client.py
      config_flow.py
      const.py
      manifest.json
      strings.json
      translations/
        en.json
```

Then restart Home Assistant.

### 2 — Configure the integration

Go to **Settings → Devices & Services → Add Integration** and search for **Unified Remote**.

| Field | Description |
|-------|-------------|
| Host | IP address of your Windows PC |
| Port | `9512` (default) |
| Password | Unified Remote server password (leave blank if none) |
| Scroll sensitivity | Scales scroll wheel deltas (default `4.0`) |

The integration will test the connection before saving.

### 3 — Install the Lovelace card

**Manual:**
1. Build or download `dist/unified-remote-card.js`
2. Copy to `config/www/unified-remote/unified-remote-card.js`
3. Add a resource in **Settings → Dashboards → Resources**:  
   `/local/unified-remote/unified-remote-card.js` (type: JavaScript module)
4. Hard-refresh the browser

**Build from source:**
```powershell
cd path\to\unified-remote-hass
npm install
npm run build
```

### 4 — Add the card to your dashboard

Edit your dashboard and add a **Manual card**:

```yaml
type: custom:unified-remote-card
show_media_controls: true
show_volume_controls: true
show_keyboard_button: true
```

Or use the **visual editor** — all options are available there.

---

## Card configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_lock` | bool | `true` | Show LOCK button |
| `show_speed_buttons` | bool | `true` | Show ×2 / ×3 / ×4 speed toggles |
| `show_status_text` | bool | `true` | Show connection status |
| `show_volume_controls` | bool | `true` | Show volume up / down / mute buttons |
| `show_media_controls` | bool | `true` | Show media controls bar |
| `show_keyboard_button` | bool | `true` | Show keyboard toggle |
| `sensitivity` | float | `1` | Touch-to-move scale factor |
| `scroll_multiplier` | float | `1` | Two-finger scroll scale (card-side) |
| `invert_scroll` | bool | `false` | Reverse scroll direction |
| `double_tap_ms` | int | `250` | Double-tap window in ms |
| `tap_suppression_px` | int | `6` | Max movement (px) still counted as a tap |

> **Scroll tuning:** there are two independent scales.  
> `scroll_multiplier` in the card config scales the raw touchpad delta before sending.  
> `scroll_scale` in the integration config (default `4.0`) scales again before dividing by `WHEEL_DELTA` (120) to produce integer notch counts. Tune the integration's `scroll_scale` first; adjust `scroll_multiplier` for fine-grained feel.

---

## Protocol notes

The integration communicates with Unified Remote over a persistent TCP connection on port **9512** using a proprietary binary TLV format, reverse-engineered from a live PCAP capture (April 2026). See [`debug/unified_remote_protocol.md`](debug/unified_remote_protocol.md) for details.

Mouse and keyboard use **UDP** port 9512 (`Relmtech.Basic Input` remote).  
Media and volume use **TCP** port 9512 (`Unified.Media` remote).

| Card action | Unified Remote button |
|------------|----------------------|
| Play/Pause | `play_pause` |
| Stop | `stop` |
| Previous | `previous` |
| Next | `next` |
| Volume Up | `volume_up` |
| Volume Down | `volume_down` |
| Mute | `volume_mute` |

---

## Alternative: standalone Python bridge

If you want to run without HA (or on a machine that can't reach the UR server), a standalone WebSocket bridge is still available in `bridge/unified_remote_bridge.py`.

```powershell
cd path\to\unified-remote-hass\bridge
pip install -r requirements.txt
python unified_remote_bridge.py --ur-host 127.0.0.1
```

This is a separate deployment option — the Lovelace card in this repo no longer uses it.

