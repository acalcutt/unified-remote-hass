#!/usr/bin/env node
/**
 * parse_pcap.js
 * Parses a PCAPng file and extracts TCP payloads on port 9512 (Unified Remote).
 * Attempts to decode the proprietary TLV wire format and print human-readable output.
 *
 * Usage: node parse_pcap.js <file.pcapng>
 */

'use strict';

const fs = require('fs');

const file = process.argv[2] || 'PCAPdroid_02_Apr_09_37_21.pcapng';
const buf = fs.readFileSync(file);

// ── PCAPng block parser ─────────────────────────────────────────────────────

const UNIFIED_REMOTE_PORT = 9512;

let le = true; // endianness detected from SHB

function read32(b, off) {
  return le ? b.readUInt32LE(off) : b.readUInt32BE(off);
}
function read16(b, off) {
  return le ? b.readUInt16LE(off) : b.readUInt16BE(off);
}

function parsePcapng(buf) {
  const packets = []; // { src, dst, sport, dport, data, dir }
  let off = 0;
  const len = buf.length;

  while (off + 8 <= len) {
    const blockType = buf.readUInt32LE(off);
    // Section Header Block — detect endianness
    if (blockType === 0x0A0D0D0A) {
      const byteOrderMagic = buf.readUInt32LE(off + 8);
      le = byteOrderMagic === 0x1A2B3C4D;
      const totalLen = read32(buf, off + 4);
      off += totalLen;
      continue;
    }

    const totalLen = read32(buf, off + 4);
    if (totalLen < 12 || off + totalLen > len) break;

    // Enhanced Packet Block (0x00000006) or Obsolete Packet Block (0x00000002)
    if (blockType === 0x00000006 || blockType === 0x00000002) {
      let dataOff, capLen, origLen;
      if (blockType === 0x00000006) {
        capLen = read32(buf, off + 20);
        origLen = read32(buf, off + 24);
        dataOff = off + 28;
      } else {
        capLen = read32(buf, off + 12);
        origLen = capLen;
        dataOff = off + 16;
      }

      const pkt = buf.slice(dataOff, dataOff + capLen);
      const parsed = parseTcpPayload(pkt);
      if (parsed) packets.push(parsed);
    }

    off += totalLen;
  }

  return packets;
}

// ── Ethernet / IP / TCP stack ───────────────────────────────────────────────

function parseTcpPayload(pkt) {
  if (pkt.length < 14) return null;

  // Ethernet header
  const etherType = pkt.readUInt16BE(12);

  let ipOff = 14;
  if (etherType === 0x8100) { ipOff = 18; } // VLAN tag

  // Handle raw IP (no Ethernet) — PCAPdroid sometimes uses linktype 101 (raw IP)
  // Detect by checking if first byte looks like IPv4 (0x45...) or Ethernet
  const firstByte = pkt[0];
  if (etherType !== 0x0800 && etherType !== 0x0806) {
    // Try raw IP
    if ((firstByte & 0xF0) === 0x40) {
      ipOff = 0;
    } else {
      return null;
    }
  } else if (etherType !== 0x0800) {
    return null;
  }

  if (pkt.length < ipOff + 20) return null;

  const ipVerHL = pkt[ipOff];
  const ipVer = (ipVerHL >> 4);
  if (ipVer !== 4) return null; // IPv4 only for now

  const ipHL = (ipVerHL & 0x0F) * 4;
  const proto = pkt[ipOff + 9];
  if (proto !== 6) return null; // TCP only

  const srcIP = `${pkt[ipOff+12]}.${pkt[ipOff+13]}.${pkt[ipOff+14]}.${pkt[ipOff+15]}`;
  const dstIP = `${pkt[ipOff+16]}.${pkt[ipOff+17]}.${pkt[ipOff+18]}.${pkt[ipOff+19]}`;

  const tcpOff = ipOff + ipHL;
  if (pkt.length < tcpOff + 20) return null;

  const sport = pkt.readUInt16BE(tcpOff);
  const dport = pkt.readUInt16BE(tcpOff + 2);

  if (sport !== UNIFIED_REMOTE_PORT && dport !== UNIFIED_REMOTE_PORT) return null;

  const tcpDataOff = tcpOff + ((pkt[tcpOff + 12] >> 4) * 4);
  const payload = pkt.slice(tcpDataOff);
  if (payload.length === 0) return null;

  const dir = dport === UNIFIED_REMOTE_PORT ? 'C→S' : 'S→C';
  return { src: srcIP, dst: dstIP, sport, dport, dir, data: payload };
}

// ── Unified Remote TLV decoder ──────────────────────────────────────────────

function readNullStr(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  return { str: buf.slice(off, end).toString('utf8'), next: end + 1 };
}

function decodeFields(buf, off, depth, maxDepth) {
  const result = {};
  if (depth > maxDepth) return { fields: result, next: off };

  while (off < buf.length) {
    const typeByte = buf[off];
    off++;

    if (typeByte === 0x00) {
      // End of map / null
      break;
    }

    // Read key (null-terminated string)
    const keyRes = readNullStr(buf, off);
    const key = keyRes.str;
    off = keyRes.next;

    let value;

    switch (typeByte) {
      case 0x01: // bool / action byte
        value = buf[off] !== undefined ? buf[off] : 0;
        off += 1;
        break;
      case 0x02: // nested map
        {
          const sub = decodeFields(buf, off, depth + 1, maxDepth);
          value = sub.fields;
          off = sub.next;
        }
        break;
      case 0x03: // string (length-prefixed or null-terminated — try null-term)
        {
          // Check if next bytes look like a 4-byte length prefix or null-term string
          // From protocol: 0x03 seems to be null-terminated
          const strRes = readNullStr(buf, off);
          value = strRes.str;
          off = strRes.next;
        }
        break;
      case 0x04: // integer (1 byte)
        value = buf[off];
        off += 1;
        break;
      case 0x05: // string (short, null-terminated)
        {
          const strRes = readNullStr(buf, off);
          value = strRes.str;
          off = strRes.next;
        }
        break;
      case 0x06: // nested list/map
        {
          const sub = decodeFields(buf, off, depth + 1, maxDepth);
          value = sub.fields;
          off = sub.next;
        }
        break;
      case 0x07: // enum / int
        value = buf[off];
        off += 1;
        break;
      case 0x08: // integer (1 byte)
        value = buf[off];
        off += 1;
        break;
      default:
        // Unknown type — try to skip by scanning for next null byte
        value = `<type=0x${typeByte.toString(16).padStart(2,'0')} unknown>`;
        // Bail out of further decoding for this map
        return { fields: result, next: buf.length };
    }

    result[key] = value;
  }

  return { fields: result, next: off };
}

function decodeUrMessage(data) {
  if (data.length < 4) return null;
  const msgLen = data.readUInt32BE(0);
  if (msgLen > data.length - 4) return null; // incomplete

  const payload = data.slice(4, 4 + msgLen);
  try {
    const decoded = decodeFields(payload, 0, 0, 8);
    return decoded.fields;
  } catch (e) {
    return null;
  }
}

// ── Stream reassembly ───────────────────────────────────────────────────────

const streams = {}; // key = "srcIP:sport->dstIP:dport"

function streamKey(p) {
  return `${p.src}:${p.sport}->${p.dst}:${p.dport}`;
}

function processPackets(packets) {
  const messages = [];

  for (const pkt of packets) {
    const key = streamKey(pkt);
    if (!streams[key]) streams[key] = Buffer.alloc(0);
    streams[key] = Buffer.concat([streams[key], pkt.data]);

    // Extract complete messages
    let buf = streams[key];
    let off = 0;
    while (off + 4 <= buf.length) {
      const msgLen = buf.readUInt32BE(off);
      if (msgLen === 0 || msgLen > 1_000_000) { off++; continue; } // sanity
      if (off + 4 + msgLen > buf.length) break; // incomplete

      const payload = buf.slice(off + 4, off + 4 + msgLen);
      const decoded = (() => {
        try { return decodeFields(payload, 0, 0, 8).fields; }
        catch (e) { return null; }
      })();

      if (decoded && Object.keys(decoded).length > 0) {
        messages.push({ dir: pkt.dir, src: pkt.src, sport: pkt.sport, decoded, raw: payload });
      }
      off += 4 + msgLen;
    }
    streams[key] = buf.slice(off);
  }

  return messages;
}

// ── Main ────────────────────────────────────────────────────────────────────

const packets = parsePcapng(buf);
console.log(`Found ${packets.length} TCP packets on port ${UNIFIED_REMOTE_PORT}`);

const messages = processPackets(packets);
console.log(`Decoded ${messages.length} Unified Remote messages\n`);

// Filter and display — especially look for Action=7 (run actions), mouse, keyboard
for (const msg of messages) {
  const d = msg.decoded;
  const action = d['Action'];
  const id = d['ID'];
  const run = d['Run'];
  const layout = d['Layout'];
  const keepAlive = d['KeepAlive'];

  // Skip keepalives and auth noise unless verbose
  if (keepAlive !== undefined) continue;

  let label = '';
  if (action !== undefined) {
    label = `Action=0x${action.toString(16).padStart(2,'0')}`;
  }
  if (id) label += ` ID=${id}`;
  if (run && typeof run === 'object' && run['Name']) label += ` Run.Name=${run['Name']}`;

  console.log(`[${msg.dir}] ${label}`);

  // Print Layout.Controls structure for action 7 (run)
  if (action === 7 && layout && typeof layout === 'object') {
    const controls = layout['Controls'];
    if (controls && typeof controls === 'object') {
      const first = controls[''] || controls['0'];
      if (first && typeof first === 'object') {
        const onAction = first['OnAction'];
        if (onAction && typeof onAction === 'object') {
          console.log(`    OnAction.Name=${onAction['Name']}  Type=0x${(onAction['Type']||0).toString(16)}`);
        }
      }
    }
  }

  // Print full decoded if it looks interesting (not just auth)
  const isInteresting = action === 7 || id && (id.includes('Mouse') || id.includes('Touch') || id.includes('Input'));
  if (isInteresting) {
    console.log('    Full:', JSON.stringify(d, null, 2).split('\n').map((l,i) => i?'    '+l:l).join('\n'));
  }
}

// Extra pass: show all unique remote IDs and Run.Name values seen
console.log('\n── Unique Remote IDs seen ──');
const remoteIds = new Set();
const runNames = new Set();
for (const msg of messages) {
  if (msg.decoded['ID']) remoteIds.add(msg.decoded['ID']);
  const run = msg.decoded['Run'];
  if (run && typeof run === 'object' && run['Name']) runNames.add(`${msg.decoded['ID']}::${run['Name']}`);
}
for (const r of remoteIds) console.log(' ', r);
console.log('\n── Unique Run actions seen ──');
for (const r of runNames) console.log(' ', r);

// Raw hex dump of first 3 action=7 messages for inspection
console.log('\n── Raw hex of first 3 Run (action=7) messages ──');
let shown = 0;
for (const msg of messages) {
  if (msg.decoded['Action'] === 7 && shown < 3) {
    console.log(`[${msg.dir}] ${msg.raw.toString('hex')}`);
    shown++;
  }
}
