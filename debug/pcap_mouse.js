#!/usr/bin/env node
/**
 * pcap_mouse.js
 * Focused deep-dump of ALL decoded messages, paying special attention to
 * Relmtech.Basic Input, Core.Mouse, and any action that isn't Action=0x07.
 * Also tries decoding with NO header skip and prints raw bytes for anything
 * the standard decoder cannot parse.
 */
'use strict';
const fs = require('fs');
const file = process.argv[2] || 'PCAPdroid_02_Apr_09_37_21.pcapng';
const buf = fs.readFileSync(file);

// ── PCAPng + TCP extraction ──────────────────────────────────────────────────
let le = true;
const r32 = off => le ? buf.readUInt32LE(off) : buf.readUInt32BE(off);
const r16 = off => le ? buf.readUInt16LE(off) : buf.readUInt16BE(off);

const interfaces = [];
const rawPayloads = [];
let off = 0;

while (off + 8 <= buf.length) {
  const blkType = buf.readUInt32LE(off);
  if (blkType === 0x0A0D0D0A) {
    const bom = buf.readUInt32LE(off + 8);
    le = bom === 0x1A2B3C4D;
    off += r32(off + 4); continue;
  }
  const totalLen = r32(off + 4);
  if (totalLen < 12 || totalLen > 10_000_000 || off + totalLen > buf.length) break;
  if (blkType === 0x00000001) interfaces.push(r16(off + 8));
  if (blkType === 0x00000006 || blkType === 0x00000002) {
    let capLen, dataOff;
    const ifIdx = blkType === 0x00000006 ? r32(off + 8) : 0;
    if (blkType === 0x00000006) { capLen = r32(off + 20); dataOff = off + 28; }
    else { capLen = r32(off + 12); dataOff = off + 16; }
    const linkType = interfaces[ifIdx] ?? 1;
    const pktBuf = buf.slice(dataOff, dataOff + capLen);
    const tcp = extractTcp(pktBuf, linkType);
    if (tcp && (tcp.sport === 9512 || tcp.dport === 9512) && tcp.payload.length > 0) {
      tcp.dir = tcp.dport === 9512 ? 'C→S' : 'S→C';
      rawPayloads.push(tcp);
    }
  }
  off += totalLen;
}

console.log(`Raw TCP payloads on port 9512: ${rawPayloads.length}`);
// Print per-packet byte counts
rawPayloads.forEach((p, i) => {
  console.log(`  [${i}] ${p.dir} ${p.src}:${p.sport}→${p.dst}:${p.dport}  len=${p.payload.length}`);
});

// ── Reassemble each direction separately ─────────────────────────────────────
const streams = {};
const messages = [];

for (const pkt of rawPayloads) {
  const key = `${pkt.src}:${pkt.sport}->${pkt.dst}:${pkt.dport}`;
  if (!streams[key]) streams[key] = { dir: pkt.dir, buf: Buffer.alloc(0) };
  streams[key].buf = Buffer.concat([streams[key].buf, pkt.payload]);

  let sb = streams[key].buf;
  let soff = 0;
  while (soff + 4 <= sb.length) {
    const msgLen = sb.readUInt32BE(soff);
    if (msgLen === 0 || msgLen > 500_000) { soff++; continue; }
    if (soff + 4 + msgLen > sb.length) break;
    const payload = sb.slice(soff + 4, soff + 4 + msgLen);
    messages.push({ dir: pkt.dir, payload, src: pkt.src, dport: pkt.dport });
    soff += 4 + msgLen;
  }
  streams[key].buf = sb.slice(soff);
}

// Show any leftover (partial) bytes per stream
for (const [key, s] of Object.entries(streams)) {
  if (s.buf.length > 0) {
    console.log(`\n⚠ Stream ${key} has ${s.buf.length} unprocessed bytes:`);
    console.log('  ' + s.buf.toString('hex'));
  }
}

console.log(`\nTotal messages decoded: ${messages.length}`);

// ── TLV decoder (no header skip + auto-detecting prefix) ─────────────────────
function readNullStr(b, o) {
  let e = o;
  while (e < b.length && b[e] !== 0) e++;
  return { s: b.slice(o, e).toString('utf8'), next: e + 1 };
}

function decodeTlv(b, start, depth) {
  const result = {};
  let o = start;
  while (o < b.length) {
    const type = b[o++];
    if (type === 0x00) break;
    const kr = readNullStr(b, o);
    const key = kr.s;
    o = kr.next;
    if (o > b.length) break;
    let value;
    switch (type) {
      case 0x01: value = true; break;
      case 0x02: case 0x06: {
        const sub = decodeTlv(b, o, depth + 1);
        value = sub.fields; o = sub.next; break;
      }
      case 0x03: { const r = readNullStr(b, o); value = r.s || b.slice(o, r.next-1).toString('hex'); o = r.next; break; }
      case 0x04: case 0x07: case 0x08: value = b[o++]; break;
      case 0x05: { const r = readNullStr(b, o); value = r.s; o = r.next; break; }
      // Float (4-byte big-endian) — possible type for coordinates
      case 0x0A: case 0x0B: case 0x0C: case 0x0D: case 0x0E: case 0x0F: {
        value = `<type=0x${type.toString(16)} 4bytes=${b.slice(o,o+4).toString('hex')}>`;
        o += 4; break;
      }
      default: {
        value = `<unk type=0x${type.toString(16).padStart(2,'0')} @${o-1}>`;
        o = b.length; break;
      }
    }
    if (result[key] !== undefined) {
      if (!Array.isArray(result[key])) result[key] = [result[key]];
      result[key].push(value);
    } else { result[key] = value; }
  }
  return { fields: result, next: o };
}

function tryDecode(payload) {
  // Try with the 2-byte prefix skip first (confirmed for action messages)
  if (payload.length > 2 && payload[0] === 0x00 && payload[1] === 0x01) {
    try {
      const { fields } = decodeTlv(payload, 2, 0);
      if (Object.keys(fields).length > 0) return { fields, skip: 2 };
    } catch {}
  }
  // Try without skip
  try {
    const { fields } = decodeTlv(payload, 0, 0);
    if (Object.keys(fields).length > 0) return { fields, skip: 0 };
  } catch {}
  return null;
}

// ── Print ALL messages ────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(80));
for (let i = 0; i < messages.length; i++) {
  const m = messages[i];
  const dec = tryDecode(m.payload);
  const f = dec?.fields;
  const action = f?.['Action'];
  const id = f?.['ID'];
  const keepAlive = f?.['KeepAlive'];

  // Suppress verbose server-side messages and known-good auth/list messages
  const isBoring = (
    action === 0x08 ||                              // get-layout for any remote
    (keepAlive !== undefined && !id) ||             // keepalive
    (action === 0x0a && !id) ||                     // list remotes
    (action === 0x00 || action === 0x01)             // auth handshake
  );

  const isMouseOrInput = id && (
    id.includes('Mouse') || id.includes('Input') || id.includes('Basic') || id.includes('Touch')
  );
  const isRunAction = action === 0x07;
  const isFromServer = m.dir === 'S→C';
  const isPartialDecode = dec && dec.skip !== 2;
  const isNoDecode = !dec;

  // Always show: Mouse/Input remotes, Run actions (0x07), undecoded, server messages, non-boring
  const show = isMouseOrInput || isRunAction || isNoDecode || isPartialDecode || (!isBoring && !isFromServer);

  if (show) {
    let label = `MSG #${i+1} [${m.dir}] len=${m.payload.length}`;
    if (action !== undefined) label += ` Action=0x${action.toString(16).padStart(2,'0')}`;
    if (id) label += ` ID=${id}`;
    if (keepAlive !== undefined) label += ' KeepAlive';
    if (isNoDecode) label += ' [UNDECODED]';
    if (isPartialDecode) label += ' [skip=0 decode]';
    console.log(label);

    if (f) {
      for (const [k, v] of Object.entries(f)) {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        } else {
          const disp = typeof v === 'number' ? `0x${v.toString(16)} (${v})` : String(v);
          console.log(`  ${k}: ${disp}`);
        }
      }
    }
    // Always print raw hex for undecoded / input / run messages
    if (isNoDecode || isMouseOrInput || (isRunAction && !id?.includes('Media'))) {
      console.log('  raw:', m.payload.toString('hex'));
    }
    console.log();
  }
}

// ── Extra: search raw bytes for float-like delta patterns ────────────────────
// Mouse deltas are likely small floats. Scan for known UR fields in any undecoded payloads.
console.log('═'.repeat(80));
console.log('SCANNING ALL MESSAGES FOR FLOAT BYTES (mouse delta candidates):');
let floatHits = 0;
for (let i = 0; i < messages.length; i++) {
  const m = messages[i];
  const b = m.payload;
  // Look for "dx" or "dy" or "x" or "y" null-terminated field names
  for (let o = 0; o < b.length - 4; o++) {
    const ch = b[o];
    // Look for short field names followed by null: "x\0", "y\0", "dx\0", "dy\0", "X\0", "Y\0"
    if (
      (b[o] === 0x78 && b[o+1] === 0x00) ||   // "x\0"
      (b[o] === 0x79 && b[o+1] === 0x00) ||   // "y\0"
      (b[o] === 0x58 && b[o+1] === 0x00) ||   // "X\0"
      (b[o] === 0x59 && b[o+1] === 0x00) ||   // "Y\0"
      (b[o] === 0x64 && b[o+1] === 0x78 && b[o+2] === 0x00) ||  // "dx\0"
      (b[o] === 0x64 && b[o+1] === 0x79 && b[o+2] === 0x00)     // "dy\0"
    ) {
      console.log(`MSG #${i+1} [${m.dir}]: coordinate field at byte ${o}: '${b.slice(o, o+4).toString('ascii').replace(/\x00/g,'\\0')}'`);
      console.log('  context:', b.slice(Math.max(0,o-4), o+12).toString('hex'));
      floatHits++;
    }
  }
}
if (floatHits === 0) console.log('  No x/y/dx/dy field names found — mouse format may differ.\n');

// ── Also: dump ALL S→C messages (server responses) ───────────────────────────
console.log('\n' + '═'.repeat(80));
console.log('ALL S→C (server) messages — raw hex:');
for (let i = 0; i < messages.length; i++) {
  const m = messages[i];
  if (m.dir !== 'S→C') continue;
  const dec = tryDecode(m.payload);
  const f = dec?.fields;
  const action = f?.['Action'];
  console.log(`MSG #${i+1} [${m.dir}] len=${m.payload.length} action=${action !== undefined ? '0x'+action.toString(16) : '?'}`);
  console.log('  raw:', m.payload.slice(0, 80).toString('hex'), m.payload.length > 80 ? '...' : '');
  if (f) {
    const short = {};
    for (const [k, v] of Object.entries(f)) {
      if (typeof v !== 'object') short[k] = v;
    }
    if (Object.keys(short).length) console.log('  fields:', JSON.stringify(short));
  }
  console.log();
}

// ── TCP extraction helpers ────────────────────────────────────────────────────
function extractTcp(pkt, linkType) {
  let ipOff = 0;
  if (linkType === 1) {
    if (pkt.length < 14) return null;
    const et = pkt.readUInt16BE(12);
    if (et === 0x8100) ipOff = 18;
    else if (et === 0x0800) ipOff = 14;
    else return null;
  } else if (linkType === 101 || linkType === 228) {
    ipOff = 0;
  } else {
    if ((pkt[0] & 0xF0) !== 0x40) return null;
    ipOff = 0;
  }
  if (pkt.length < ipOff + 20) return null;
  const ipVerHL = pkt[ipOff];
  if ((ipVerHL >> 4) !== 4) return null;
  const ipHL = (ipVerHL & 0x0F) * 4;
  if (pkt[ipOff + 9] !== 6) return null;
  const srcIP = `${pkt[ipOff+12]}.${pkt[ipOff+13]}.${pkt[ipOff+14]}.${pkt[ipOff+15]}`;
  const dstIP = `${pkt[ipOff+16]}.${pkt[ipOff+17]}.${pkt[ipOff+18]}.${pkt[ipOff+19]}`;
  const tcpOff = ipOff + ipHL;
  if (pkt.length < tcpOff + 20) return null;
  const sport = pkt.readUInt16BE(tcpOff);
  const dport = pkt.readUInt16BE(tcpOff + 2);
  const tcpDataOff = tcpOff + ((pkt[tcpOff + 12] >> 4) * 4);
  return { src: srcIP, dst: dstIP, sport, dport, payload: pkt.slice(tcpDataOff) };
}
