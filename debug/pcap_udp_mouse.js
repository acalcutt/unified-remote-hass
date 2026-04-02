/**
 * Decode UDP mouse Run actions from Unified Remote.
 * UR uses UDP port 9512 for real-time mouse/touch events.
 */
const fs = require('fs');
const path = require('path');

const pcapFile = process.argv[2] || 'PCAPdroid_02_Apr_17_46_42.pcapng';
const buf = fs.readFileSync(path.resolve(__dirname, pcapFile));

// ── PCAPNG reader ──────────────────────────────────────────────────────────
function readPcapng(buf) {
  const packets = [];
  let off = 0;
  while (off < buf.length) {
    if (off + 8 > buf.length) break;
    const blockType = buf.readUInt32LE(off);
    const blockLen  = buf.readUInt32LE(off + 4);
    if (blockLen < 12 || off + blockLen > buf.length) break;
    if (blockType === 0x00000006) {
      const capturedLen = buf.readUInt32LE(off + 20);
      packets.push(buf.slice(off + 28, off + 28 + capturedLen));
    }
    off += blockLen;
  }
  return packets;
}

// ── IPv4/UDP extractor ─────────────────────────────────────────────────────
function extractUdp(raw) {
  if (raw.length < 20) return null;
  const ihl = (raw[0] & 0x0f) * 4;
  if (raw[9] !== 17) return null; // not UDP
  if (raw.length < ihl + 8) return null;
  const srcIP  = `${raw[12]}.${raw[13]}.${raw[14]}.${raw[15]}`;
  const dstIP  = `${raw[16]}.${raw[17]}.${raw[18]}.${raw[19]}`;
  const srcPort = raw.readUInt16BE(ihl);
  const dstPort = raw.readUInt16BE(ihl + 2);
  const payload = raw.slice(ihl + 8);
  return { srcIP, dstIP, srcPort, dstPort, payload };
}

// ── UR TLV decoder ─────────────────────────────────────────────────────────
function decodeFields(buf, off = 2) { // skip 00 01 prefix
  const fields = {};
  while (off < buf.length) {
    const t = buf[off++];
    if (t === 0x00) break;
    let kEnd = off;
    while (kEnd < buf.length && buf[kEnd] !== 0) kEnd++;
    const key = buf.slice(off, kEnd).toString('utf8');
    off = kEnd + 1;
    if (off >= buf.length) break;

    switch (t) {
      case 0x08: fields[key] = buf[off++]; break;
      case 0x05: { let e=off; while(e<buf.length&&buf[e]!==0)e++; fields[key]=buf.slice(off,e).toString('utf8'); off=e+1; break; }
      case 0x04: { if(off+4<=buf.length){fields[key]=buf.readFloatBE(off);} off+=4; break; }
      case 0x0b: { if(off+4<=buf.length){fields[key]=buf.readInt32BE(off);} off+=4; break; }
      case 0x02:
      case 0x06: { const r=decodeNested(buf,off); fields[key]=r.fields; off=r.off; break; }
      case 0x03: { if(off+4<=buf.length){const l=buf.readUInt32BE(off);off+=4;fields[key]=`<bytes ${l}>`;off+=l;} break; }
      default:   { fields[`?${t.toString(16)}:${key}`]=`0x${buf[off]?.toString(16)??'??'}`;  off++; break; }
    }
  }
  return { fields, off };
}

function decodeNested(buf, off) {
  const fields = {};
  while (off < buf.length) {
    const t = buf[off++];
    if (t === 0x00) break;
    let kEnd = off;
    while (kEnd < buf.length && buf[kEnd] !== 0) kEnd++;
    const key = buf.slice(off, kEnd).toString('utf8');
    off = kEnd + 1;
    if (off >= buf.length) break;

    switch (t) {
      case 0x08: fields[key] = buf[off++]; break;
      case 0x05: { let e=off; while(e<buf.length&&buf[e]!==0)e++; fields[key]=buf.slice(off,e).toString('utf8'); off=e+1; break; }
      case 0x04: { if(off+4<=buf.length){fields[key]=buf.readFloatBE(off);} off+=4; break; }
      case 0x0b: { if(off+4<=buf.length){fields[key]=buf.readInt32BE(off);} off+=4; break; }
      case 0x02:
      case 0x06: { const r=decodeNested(buf,off); fields[key]=r.fields; off=r.off; break; }
      case 0x03: { if(off+4<=buf.length){const l=buf.readUInt32BE(off);off+=4;fields[key]=`<bytes ${l}>`;off+=l;} break; }
      default:   { fields[`?${t.toString(16)}:${key}`]=`0x${buf[off]?.toString(16)??'??'}`; off++; break; }
    }
  }
  return { fields, off };
}

// ── Collect and decode UDP packets to port 9512 ────────────────────────────
const packets = readPcapng(buf);
const udpMsgs = [];
for (const raw of packets) {
  const u = extractUdp(raw);
  if (!u) continue;
  if (u.dstPort !== 9512 && u.srcPort !== 9512) continue;
  if (u.dstIP !== '192.168.0.92' && u.srcIP !== '192.168.0.92') continue;
  if (u.payload.length === 0) continue;
  const dir = u.dstPort === 9512 ? 'C→S' : 'S→C';
  udpMsgs.push({ dir, payload: u.payload, srcPort: u.srcPort });
}

console.log(`Total UDP packets to/from 192.168.0.92:9512: ${udpMsgs.length}\n`);

// Each UDP packet is a complete UR message (already includes 4-byte length prefix)
// Parse the first few and last few
const actionCounts = {};
const runActions = {};
let firstRun = null;

for (const msg of udpMsgs) {
  // UDP packet: [4-byte len][payload]
  if (msg.payload.length < 4) continue;
  const payloadLen = msg.payload.readUInt32BE(0);
  if (payloadLen === 0 || payloadLen > msg.payload.length - 4) {
    // Try without length prefix
    const dec = decodeFields(msg.payload, 0);
    const a = dec.fields.Action;
    if (a !== undefined) {
      const ak = `0x${a.toString(16)}`;
      actionCounts[ak] = (actionCounts[ak]||0) + 1;
    }
    continue;
  }
  const body = msg.payload.slice(4, 4 + payloadLen);
  const dec = decodeFields(body, 2);
  const a = dec.fields.Action;
  const ak = a !== undefined ? `0x${a.toString(16)}` : '?';
  actionCounts[ak] = (actionCounts[ak]||0) + 1;

  if (a === 7) {
    const run = dec.fields.Run || {};
    const name = run.Name || '?';
    if (!firstRun) firstRun = { raw: body, fields: dec.fields };
    runActions[name] = (runActions[name]||0) + 1;
  }
}

console.log('UDP Action counts:');
for (const [k, v] of Object.entries(actionCounts)) console.log(`  Action ${k}: ${v} packets`);

console.log('\nRun action button counts:');
for (const [k, v] of Object.entries(runActions)) console.log(`  "${k}": ${v} calls`);

// ── Show first Run action in detail ───────────────────────────────────────
if (firstRun) {
  console.log('\n═══ FIRST Run(0x07) Action — Full Decode ═══\n');
  console.log('RAW HEX:', firstRun.raw.toString('hex'));
  console.log('\nDECODED:', JSON.stringify(firstRun.fields, null, 2));
}

// ── Show one example of each unique button name ────────────────────────────
console.log('\n═══ One example per unique Run button ═══\n');
const shown = new Set();
for (const msg of udpMsgs) {
  if (msg.payload.length < 4) continue;
  const payloadLen = msg.payload.readUInt32BE(0);
  if (payloadLen === 0 || payloadLen > msg.payload.length - 4) continue;
  const body = msg.payload.slice(4, 4 + payloadLen);
  const dec = decodeFields(body, 2);
  if (dec.fields.Action !== 7) continue;
  const run = dec.fields.Run || {};
  const name = run.Name || '?';
  if (shown.has(name)) continue;
  shown.add(name);
  console.log(`Button: "${name}"`);
  console.log(`  raw (${body.length} bytes): ${body.toString('hex')}`);
  console.log(`  fields: ${JSON.stringify(dec.fields, null, 2)}`);
  console.log();
}

// ── Show first 5 UDP packets raw (to check format) ────────────────────────
console.log('\n═══ First 5 UDP packets — raw hex ═══\n');
for (let i = 0; i < Math.min(5, udpMsgs.length); i++) {
  const p = udpMsgs[i];
  console.log(`[${i}] ${p.dir} len=${p.payload.length} hex=${p.payload.slice(0,64).toString('hex')}`);
}
