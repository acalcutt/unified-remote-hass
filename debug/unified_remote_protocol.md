# Unified Remote Protocol Documentation
*Reverse-engineered from PCAP capture — April 2026*

---

## Overview

Unified Remote uses two separate ports:

| Port | Protocol | Purpose |
|------|----------|---------|
| 9511 | UDP | Server auto-discovery (broadcast) |
| 9512 | TCP | Control connection (persistent) |

The server observed in this capture is named **LIVINGROOM-PC** at `192.168.0.92`.

---

## 1. Discovery (UDP Port 9511)

The client sends a broadcast packet to `255.255.255.255:9511` to find servers on the LAN.

**Discovery packet (hex):**
```
364e20547c2d41722d41364e20547c2d41722d41364e20547c2d41722d41
```

This is a 30-byte repeating pattern: `364e20547c2d41722d41` (10 bytes) × 3.

The server responds (presumably) with its IP and name. In this capture, discovery **failed** (no broadcast response seen), and the user manually entered `192.168.0.92:9512`.

**Python discovery:**
```python
DISCOVERY_BROADCAST = bytes.fromhex("364e20547c2d41722d41") * 3
# Send to 255.255.255.255:9511 via UDP
```

---

## 2. Binary Wire Format

All TCP messages share the same length-prefixed binary encoding.

### Message structure

```
[4 bytes: total payload length, big-endian uint32]
[payload bytes...]
```

### Payload encoding

Every message payload begins with a **fixed 2-byte header** `0x00 0x01`, followed by a sequence of **key-value (TLV) pairs**:

```
[0x00 0x01]                              ← fixed prefix on every message
[1 byte: value type]                     ← field type
[N bytes: key string, null-terminated]   ← field name
[value bytes, size depends on type]      ← field value
...repeat...
[0x00]                                   ← end-of-map marker
```

**Confirmed type bytes (from PCAP analysis, April 2026):**

| Type byte | Meaning | Encoding |
|-----------|---------|---------|
| `0x00` | End-of-map / null | No key or value bytes; terminates the current map |
| `0x02` | Nested map | Key + null-terminated; value = further TLV pairs until `0x00` end marker |
| `0x03` | Byte sequence | Key + null-terminated; value = bytes until null terminator |
| `0x05` | String | Key + null-terminated; value = null-terminated UTF-8 string |
| `0x06` | Nested map/list | Same as `0x02`; used for indexed containers (e.g. Controls) |
| `0x08` | Integer | Key + null-terminated; value = 1 byte |

> **Note on previous documentation:** An earlier draft listed type `0x01` for the `Action` field. PCAP analysis confirms the actual type is `0x08`. The `0x00 0x01` at the start of every payload is a **fixed 2-byte prefix**, not a TLV field.

---

## 3. Session Handshake

### Step 1: Initial Connect (Client → Server, Action 0x00)

Sent immediately after TCP connection is established. Contains a plain-text password (or a generated device UUID as the initial password).

```
Fields:
  Action   = 0x00
  Password = "aaa3ee35-c9d4-478c-846b-926b6b7562d7"  (device UUID, initial auth)
  Platform = "android"
  Request  = 0x00
  Source   = "android-4b1700378687e27c"               (unique client identifier)
  Version  = 0x00 0x00 0x00 0x0a 0x00
```

**Raw hex of this packet:**
```
00000085 000108416374696f6e00 00 0550617373776f726400
61616133656533352d633964342d343738632d383436622d393236623662373536326437 00
05506c6174666f726d00 616e64726f6964 00
085265717565737400 00
05536f7572636500 616e64726f69642d34623137303033373836383765323763 00
0356657273696f6e00 00000000 0a00
```

### Step 2: Server Hello (Server → Client, Action 0x00)

Server replies with its session token, version, capabilities, and its name.

```
Fields:
  Action       = 0x00
  Security     = 0x01
  Password     = "9b4f869d-2e99-11f1-a133-8447094d4d21"  (server-assigned session token)
  Version      = 0x00 0x00 0x00 0x01
  Session      = "9b4b8a6a-2e99-11f1-90b5-8447094d4d21"
  Capabilities = { Actions=true, Sync=true, Grid=true, Fast=false, Loading=true, ... }
  Source       = "LIVINGROOM-PC"
```

### Step 3: Auth with Hashed Password (Client → Server, Action 0x01)

Client re-authenticates using a SHA-256 hash of the password.

```
Fields:
  Action        = 0x01
  Capabilities  = { Actions=true, Encryption2=true, Fast=false, Grid=true, Loading=true, Sync=true }
  Password      = "4fa2e8db1984538b4e878886c7e5f31926ff1b0605a248ec4f39816b53859ec5"  (SHA-256)
  Request       = 0x01
  Source        = "android-4b1700378687e27c"
```

### Step 4: Server Confirms Auth (Server → Client, Action 0x01)

```
Fields:
  Action      = 0x01
  Security    = 0x01
  Source      = "LIVINGROOM-PC"
  Destination = "android-4b1700378687e27c"
  Response    = 0x01
```

### Step 5: List Remotes (Client → Server, Action 0x09)

Client requests the full remote list (with hash for caching).

```
Fields:
  Action  = 0x0a
  Request = 0x0a
  Source  = "android-4b1700378687e27c"
```

Server responds with a list of all remote IDs, names, descriptions, icons (PNG bytes), etc.

---

## 4. Remote Lifecycle

### Open a Remote (Action 0x03)

Before you can run actions on a remote, you must "open" it (request its layout).

```
Fields:
  Action  = 0x03
  ID      = "Unified.Media"     ← remote identifier
  Layout  = 0x00
  Hash    = "L\xce\x96"         ← optional layout hash for caching
  Request = 0x03
  Source  = "android-4b1700378687e27c"
```

Server responds with layout data (button names, positions, icons).

### Load Remote Controls (Action 0x05)

```
Fields:
  Action  = 0x05
  ID      = "Unified.Media"
  Request = 0x05
  Source  = "android-4b1700378687e27c"
```

### Close / Leave Remote (Action 0x04)

```
Fields:
  Action  = 0x04
  ID      = "Unified.Media"
  Request = 0x04
  Source  = "android-4b1700378687e27c"
```

---

## 5. Running Actions (the Important Part)

**Action type 0x07** runs a named button/action on an open remote. This is what you'll use for media controls.

### Run Action message format

> ✅ **Verified byte-for-byte** against 4 live PCAP captures (`volume_mute`, `volume_up`, `next`, `play_pause`).

```
Fields:
  Action  = 0x07
  ID      = "<RemoteID>"
  Layout  = {                       ← type 0x02 nested map
    Controls = {                    ← type 0x06 nested map/list
      "" = {                        ← empty-string key, type 0x02 (important: NOT numeric index)
        OnAction = {                ← type 0x02 nested map
          Name = "<button_name>"   ← type 0x05 null-terminated string
        }
        Type = 8                    ← type 0x08 integer, value 8 (= button type)
      }
    }
  }
  Request = 0x07
  Run     = {                       ← type 0x02 nested map
    Name = "<button_name>"
  }
  Source  = "<source_id>"
```

### Verified hex for `Unified.Media` / `volume_mute`

Source ID used by the Android app: `android-4b1700378687e27c`

```
Payload (156 bytes, no length prefix):
  000108 "Action\0"    07
  0549 44 00           "Unified.Media\0"    ← ID field
  024c617979 6f757400                        ← Layout (nested)
    0643 6f6e74726f6c7300                    ← Controls (nested list)
      020 0                                  ← "" empty key (nested)
        024f6e416374696f6e00                 ← OnAction (nested)
          054e616d65 00 "volume_mute\0"
          00
        0854797065 00 08
        00                                   ← end ""
      00                                     ← end Controls
    00                                       ← end Layout
  0852657175657374 00 07
  025275 6e 00                               ← Run (nested)
    054e616d65 00 "volume_mute\0"
    00
  05536f75726365 00 "android-4b1700378687e27c\0"
  00                                         ← end of message

Full hex:
000108416374696f6e000705494400556e69666965642e4d6564696100
024c61796f75740006436f6e74726f6c73000200024f6e416374696f6e00
054e616d6500766f6c756d655f6d757465000008547970650008000000
085265717565737400070252756e00054e616d6500766f6c756d655f6d757465000005
536f7572636500616e64726f69642d346231373030333738363837653237630000
```

### Layout fetch before running (Action 0x08 / Get Layout)

The UR Android app sends **one Action=0x08** request per installed remote at connection time (bulk layout prefetch). The bridge does not need to do this for basic operation — running Action=0x07 without the prior Action=0x08 appears to work.

---

## 6. Unified.Media Remote — Button Names

**4 directly confirmed from PCAP** (marked ✅). Remaining names inferred from app source / documentation:

| Button name    | Action | Verified |
|----------------|--------|---------|
| `volume_down`  | Volume Down | (inferred) |
| `volume_up`    | Volume Up | ✅ PCAP |
| `volume_mute`  | Toggle Mute | ✅ PCAP |
| `previous`     | Previous Track | (inferred) |
| `next`         | Next Track | ✅ PCAP |
| `stop`         | Stop | (inferred) |
| `play_pause`   | Play / Pause | ✅ PCAP |

---

## 7. Mouse / Touch Controls (Relmtech.Basic Input)

> ✅ **Confirmed from PCAP** (`PCAPdroid_02_Apr_17_46_42.pcapng`) — 1,646 UDP packets decoded.

### Key difference from media actions: **UDP, not TCP**

All mouse Run actions are sent over **UDP port 9512**, not the TCP connection. The same UR TLV wire format applies (4-byte length prefix + `0x00 0x01` prefix + TLV fields).

### UDP Session Association (Action 0x0b)

Before sending any mouse actions, the client sends one UDP packet to associate the UDP source port with the existing TCP session:

```
Fields (sent over UDP):
  Action       = 0x0b
  Capabilities = { Fast = 1 }   ← type 0x04, 1-byte value
  Request      = 0x0b
  Session      = "<session-uuid>"  ← from server's TCP Action 0x00 'Password' field
  Source       = "<source-id>"
```

**Getting the session UUID**: The server's first TCP response (Action 0x00 hello) contains a `Password` field which is the session UUID, e.g. `6c5327ce-2edd-11f1-a71e-8447094d4d21`. This must be included in every UDP packet.

### Mouse Run Action format

The structure differs from media Run actions in three ways:
1. Sent over **UDP**
2. Includes `Session` field
3. Parameters are passed as an `Extras.Values` key-value list (strings), and a `Target` field

```
Fields:
  Action  = 0x07
  ID      = "Relmtech.Basic Input"
  Layout  = {
    Controls = {
      "" = {
        OnAction = {
          Extras = {
            Values = [
              { Key = "X",  Value = "-7" }   ← type 0x02, empty-string key per entry
              { Key = "Y",  Value = "-1" }
            ]
          }
          Name   = "MoveBy"
          Target = "Core.Input"
        }
        Type = 8
      }
    }
  }
  Request = 0x07
  Run     = {
    Extras = { Values = [ ... same as above ... ] }
    Name   = "MoveBy"
    Target = "Core.Input"
  }
  Session = "6c5327ce-2edd-11f1-a71e-8447094d4d21"
  Source  = "<source-id>"
```

### Confirmed action names and parameters

> **Button casing**: The wire format uses `"Left"`, `"Right"`, `"Middle"` (capitalized). The Lua API uses lowercase `"left"`, `"right"` — these are different layers.

> **VScroll/HScroll unit**: Unknown without PCAP. Likely "scroll notches". The bridge accumulates pixel-space deltas scaled by `--scroll-scale` and divides by Windows `WHEEL_DELTA` (120) to fire one notch, mirroring the SendInput path.

| Action name | Parameters | Verified | Lua API equiv |
|-------------|-----------|---------|---------------|
| `MoveBy`  | `X` = dx string, `Y` = dy string | ✅ 1,636 PCAP calls | `ms.moveby(dx,dy)` |
| `Click`   | `Button` = `"Left"` or `"Right"` | ✅ PCAP verified | `ms.click([btn])` |
| `VScroll` | `Amount` = notch count string | inferred from Lua | `ms.vscroll(n)` |
| `HScroll` | `Amount` = notch count string | inferred from Lua | `ms.hscroll(n)` |
| `DoubleClick`| `Button` = `"Left"` | *Note: Official app just sends `Click` twice* | `ms.double([btn])` |
| `Down`    | `Button` = `"Left"` | inferred from Lua | `ms.down([btn])` |
| `Up`      | `Button` = `"Left"` | inferred from Lua | `ms.up([btn])` |
| `Text`    | `Text` = string | ✅ PCAP verified | `kb.text(string)` |
| `Press`   | `Key` = `ur_key_name` | inferred from Lua | `kb.press(string)` |

### Verified raw hex — MoveBy X=-7 Y=-1 (353-byte payload)

```
000108416374696f6e00070549440052656c6d746563682e426173696320496e7075740002
4c61796f75740006436f6e74726f6c73000200024f6e416374696f6e00024578747261730006
56616c756573000200054b65790058000556616c7565002d3700000200054b65790059000556
616c7565002d3100000000054e616d65004d6f76654279000554617267657400436f72652e49
6e707574000008547970650008000000085265717565737400070252756e00024578747261730006
56616c756573000200054b65790058000556616c7565002d3700000200054b65790059000556
616c7565002d3100000000054e616d65004d6f76654279000554617267657400436f72652e49
6e70757400000553657373696f6e0036633533323763652d326564642d313166312d613731652d
3834343730393464346432310005536f7572636500616e64726f69642d34623137303033373836
3837653237630000
```

---

## 8. Keep-Alive

The client sends a keep-alive every ~60 seconds:

```
Fields:
  KeepAlive = 0x01
  Source    = "android-4b1700378687e27c"
```

**Raw hex:**
```
00000030 000104 4b656570416c697665 00 01
05536f75726365 00 616e64726f69642d34623137303033373836383765323763 0000
```

---

## 8. Remote IDs Reference

Useful remotes seen in the capture:

| Remote ID | Description |
|-----------|-------------|
| `Unified.Media` | Generic media controls (play, pause, volume, etc.) |
| `Unified.Volume` | Volume control only |
| `Core.Mouse` | Mouse control |
| `Core.Keyboard` | Keyboard input |
| `Core.Input` | Basic input |
| `Unified.VLC` | VLC media player |
| `Unified.Spotify` | Spotify |
| `Unified.Chrome` | Chrome browser |
| `Unified.Power` | Power/shutdown |
| `Relmtech.Basic Input` | Basic mouse/keyboard remote |

---

## 10. Observed Packet Sequence (Full PCAP Summary)

From `PCAPdroid_02_Apr_09_37_21.pcapng` — 75 client→server messages total:

```
Client                            Server
  |                                 |
  |-- TCP connect :9512 ----------> |
  |-- Action 0x00 (identify) -----> |
  |            <------------------- Action 0x00 (hello + session token)
  |-- Action 0x0a (list remotes) -> |
  |            <------------------- Action 0x01 (auth challenge)
  |-- Action 0x01 (auth hash) ----> |
  |            <------------------- Action 0x0a (capabilities)
  |            <------------------- Action 0x0b (capabilities ack)
  |            <------------------- Action 0x09 (remote list, ~67 KB)
  |-- Action 0x08 × 57 (layouts) -> |  ← client prefetches all installed remotes
  |-- KeepAlive -----------------> |
  |            <------------------- layout responses (multiple large messages)
  |                                 |
  |  ── Browse to Relmtech.Basic Input ──
  |-- Action 0x05 (load) ---------> |
  |-- Action 0x03 (open) ---------> |
  |-- Action 0x04 (close) --------> |  ← no Run actions sent
  |                                 |
  |  ── Switch to Unified.Media ──
  |-- Action 0x03 (open) ---------> |
  |-- Action 0x04 (close) --------> |
  |-- Action 0x05 (load) ---------> |
  |-- Action 0x07 volume_mute ----> |  ✅ confirmed Run
  |-- Action 0x07 volume_up ------> |  ✅ confirmed Run
  |-- Action 0x07 next -----------> |  ✅ confirmed Run
  |-- Action 0x07 play_pause -----> |  ✅ confirmed Run
  |-- Action 0x04 (close) --------> |
  |-- Action 0x05 (load) ---------> |
  |-- Action 0x04 (close) --------> |
  |-- Action 0x05 (load) ---------> |
  |-- KeepAlive -----------------> |
```