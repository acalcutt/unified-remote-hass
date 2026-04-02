#!/usr/bin/env node
/**
 * pcap_full.js
 * Full analysis: dumps all port-9512 TCP payloads, decodes UR TLV, extracts mouse/touch actions.
 */
'use strict';
const fs = require('fs');
const file = process.argv[2] || 'PCAPdroid_02_Apr_09_37_21.pcapng';
const buf = fs.readFileSync(file);

// ── PCAPng + TCP extraction (same as pcap_debug.js) ─────────────────────────
let le = true;
function r32(off) { return le ? buf.readUInt32LE(off) : buf.readUInt32BE(off); }
function r16(off) { return le ? buf.readUInt16LE(off) : buf.readUInt16BE(off); }

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
    let ifIdx = 0, capLen, dataOff;
    if (blkType === 0x00000006) { ifIdx = r32(off+8); capLen = r32(off+20); dataOff = off+28; }
    else                         { capLen = r32(off+12); dataOff = off+16; }
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

console.log(`Extracted ${rawPayloads.length} TCP payloads on port 9512\n`);

// ── Stream reassembly ────────────────────────────────────────────────────────
// Reassemble per stream, then parse UR messages
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

console.log(`Reassembled ${messages.length} UR messages\n`);

// ── TLV decoder ──────────────────────────────────────────────────────────────
// Observed format: first 2 bytes are header (00 01), then TLV fields
// Field format: [1 byte type][key null-terminated][value based on type]
// Types:
//   0x00 = end-of-map
//   0x02 = nested map (TLV until 0x00)
//   0x03 = bytes until 0x00 (or may contain embedded nulls - read raw)
//   0x04 = 1-byte integer
//   0x05 = null-terminated string
//   0x06 = nested map/list
//   0x07 = 1-byte integer
//   0x08 = 1-byte integer

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
    if (type === 0x00) break; // end of map

    // Read key
    const kr = readNullStr(b, o);
    const key = kr.s;
    o = kr.next;
    if (o > b.length) break;

    let value;
    switch (type) {
      case 0x01: value = true; break;             // boolean true, no value bytes
      case 0x02: case 0x06: {                     // nested map
        const sub = decodeTlv(b, o, depth + 1);
        value = sub.fields;
        o = sub.next;
        break;
      }
      case 0x03: {                                 // bytes/string (null-terminated)
        // Could contain embedded 0x00 - but for now read until null
        const r = readNullStr(b, o);
        value = r.s || b.slice(o, r.next - 1).toString('hex');
        o = r.next;
        break;
      }
      case 0x04: case 0x07: case 0x08: {          // 1-byte integer
        value = b[o++];
        break;
      }
      case 0x05: {                                 // null-terminated string
        const r = readNullStr(b, o);
        value = r.s;
        o = r.next;
        break;
      }
      default: {
        value = `<unk type=0x${type.toString(16).padStart(2,'0')}>`;
        o = b.length; // bail
        break;
      }
    }

    if (result[key] !== undefined) {
      // Handle duplicate keys (indexed list)
      if (!Array.isArray(result[key])) result[key] = [result[key]];
      result[key].push(value);
    } else {
      result[key] = value;
    }
  }
  return { fields: result, next: o };
}

function decodeMsg(payload) {
  // Skip first 2 bytes (fixed header 00 01)
  if (payload.length < 2) return null;
  const skip = 2;
  const { fields } = decodeTlv(payload, skip, 0);
  if (Object.keys(fields).length === 0) {
    // Try without skip
    const { fields: f2 } = decodeTlv(payload, 0, 0);
    return Object.keys(f2).length > 0 ? f2 : null;
  }
  return fields;
}

// ── Print all messages ───────────────────────────────────────────────────────
console.log('═'.repeat(72));
for (let i = 0; i < messages.length; i++) {
  const m = messages[i];
  const fields = decodeMsg(m.payload);
  const hexPreview = m.payload.slice(0, 32).toString('hex');

  const action = fields?.['Action'];
  const id = fields?.['ID'];
  const run = fields?.['Run'];
  const keepAlive = fields?.['KeepAlive'];

  let label = `MSG #${i+1} [${m.dir}]`;
  if (action !== undefined) label += ` Action=0x${action.toString(16).padStart(2,'0')}`;
  if (id) label += ` ID=${id}`;
  if (keepAlive !== undefined) label += ' KeepAlive';

  console.log(label);

  if (fields) {
    // Pretty print interesting fields
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        console.log(`  ${k}: {`);
        for (const [k2, v2] of Object.entries(v)) {
          if (typeof v2 === 'object' && v2 !== null) {
            console.log(`    ${k2}: ${JSON.stringify(v2)}`);
          } else {
            const disp = typeof v2 === 'number' ? `0x${v2.toString(16)} (${v2})` : String(v2);
            console.log(`    ${k2}: ${disp}`);
          }
        }
        console.log('  }');
      } else {
        const disp = typeof v === 'number' ? `0x${v.toString(16)} (${v})` : String(v);
        console.log(`  ${k}: ${disp}`);
      }
    }
  } else {
    console.log(`  [could not decode]`);
    console.log(`  raw hex: ${hexPreview}...`);
  }
  console.log();
}

// ── Summary of unique Run actions and remote IDs ─────────────────────────────
console.log('═'.repeat(72));
console.log('UNIQUE REMOTE IDs:');
const ids = new Set();
const runs = new Set();
for (const m of messages) {
  const f = decodeMsg(m.payload);
  if (f?.['ID']) ids.add(f['ID']);
  const run = f?.['Run'];
  if (run && typeof run === 'object' && run['Name']) {
    runs.add(`${f['ID']}::${run['Name']}`);
  }
}
for (const x of ids) console.log('  ', x);
console.log('\nUNIQUE RUN ACTIONS:');
for (const x of runs) console.log('  ', x);

// ── Full raw hex of all action=7 (run) messages ───────────────────────────────
console.log('\n═'.repeat(72));
console.log('ALL ACTION=7 (RUN) MESSAGES — RAW HEX:');
for (let i = 0; i < messages.length; i++) {
  const m = messages[i];
  const f = decodeMsg(m.payload);
  if (f?.['Action'] === 7) {
    console.log(`\nMSG #${i+1} [${m.dir}] len=${m.payload.length}`);
    console.log(m.payload.toString('hex'));
    console.log('  decoded:', JSON.stringify(f, null, 2));
  }
}

// ── TCP extraction helpers ───────────────────────────────────────────────────
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
