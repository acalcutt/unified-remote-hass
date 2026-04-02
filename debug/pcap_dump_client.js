/**
 * Dump every client→server message fully decoded.
 * Shows Action type, all fields, and raw hex for any Run(0x07) action.
 */
const fs = require('fs');
const path = require('path');

const pcapFile = process.argv[2] || 'PCAPdroid_02_Apr_09_37_21.pcapng';
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
    if (blockType === 0x00000006) { // EPB
      const capturedLen = buf.readUInt32LE(off + 20);
      const data = buf.slice(off + 28, off + 28 + capturedLen);
      packets.push(data);
    }
    off += blockLen;
  }
  return packets;
}

// ── IP/TCP extraction (linkType=101 Raw IPv4) ──────────────────────────────
function extractTcp(raw) {
  if (raw.length < 20) return null;
  const ihl = (raw[0] & 0x0f) * 4;
  if (raw[1] >> 6 !== 0) return null; // not IPv4
  if (raw[9] !== 6) return null;      // not TCP
  if (raw.length < ihl + 20) return null;
  const srcIP  = `${raw[12]}.${raw[13]}.${raw[14]}.${raw[15]}`;
  const dstIP  = `${raw[16]}.${raw[17]}.${raw[18]}.${raw[19]}`;
  const srcPort = raw.readUInt16BE(ihl);
  const dstPort = raw.readUInt16BE(ihl + 2);
  const seq     = raw.readUInt32BE(ihl + 4);
  const dataOff = ((raw[ihl + 12] >> 4) * 4);
  const payload = raw.slice(ihl + dataOff);
  return { srcIP, dstIP, srcPort, dstPort, seq, payload };
}

// ── TLV decoder ──────────────────────────────────────────────────────────
function decodeFields(buf, skip2 = true) {
  const fields = {};
  let off = skip2 ? 2 : 0;
  while (off < buf.length) {
    const typeB = buf[off++];
    if (typeB === 0x00) break;
    // read null-terminated key
    let keyEnd = off;
    while (keyEnd < buf.length && buf[keyEnd] !== 0x00) keyEnd++;
    const key = buf.slice(off, keyEnd).toString('utf8');
    off = keyEnd + 1;
    if (off >= buf.length) break;

    if (typeB === 0x08) {
      // 1-byte integer
      fields[key] = buf[off++];
    } else if (typeB === 0x05) {
      // null-terminated string
      let vEnd = off;
      while (vEnd < buf.length && buf[vEnd] !== 0x00) vEnd++;
      fields[key] = buf.slice(off, vEnd).toString('utf8');
      off = vEnd + 1;
    } else if (typeB === 0x02 || typeB === 0x06) {
      // nested: recurse
      const sub = decodeFields(buf.slice(off), false);
      fields[key] = sub.fields;
      off += sub.consumed;
    } else if (typeB === 0x03) {
      // byte sequence: 4-byte length then data
      if (off + 4 > buf.length) break;
      const len = buf.readUInt32BE(off); off += 4;
      fields[key] = `<bytes len=${len}>`;
      off += len;
    } else if (typeB === 0x04) {
      // 4-byte float
      if (off + 4 > buf.length) break;
      fields[key] = buf.readFloatBE(off);
      off += 4;
    } else if (typeB === 0x0a || typeB === 0x0b) {
      // 4-byte int
      if (off + 4 > buf.length) break;
      fields[key] = buf.readInt32BE(off);
      off += 4;
    } else {
      // unknown - try skip 1 byte
      fields[`<unk:${typeB.toString(16)}:${key}>`] = buf[off++];
    }
  }
  return { fields, consumed: off };
}

// ── Stream reassembly ─────────────────────────────────────────────────────
const streams = {};
const packets = readPcapng(buf);
for (const raw of packets) {
  const t = extractTcp(raw);
  if (!t || t.payload.length === 0) continue;
  if (t.dstPort !== 9512 && t.srcPort !== 9512) continue;
  const key = `${t.srcIP}:${t.srcPort}->${t.dstIP}:${t.dstPort}`;
  if (!streams[key]) streams[key] = [];
  streams[key].push({ seq: t.seq, data: t.payload });
}

// Sort by seq and concatenate
const streamData = {};
for (const [key, segs] of Object.entries(streams)) {
  segs.sort((a, b) => {
    let d = a.seq - b.seq;
    if (d > 2000000000) d -= 4294967296;
    if (d < -2000000000) d += 4294967296;
    return d;
  });
  const chunks = [];
  let lastSeq = null;
  for (const s of segs) {
    if (lastSeq === null || s.seq !== lastSeq) {
      chunks.push(s.data);
      lastSeq = s.seq + s.data.length;
    }
  }
  streamData[key] = Buffer.concat(chunks);
}

// ── Parse messages from client→server streams ─────────────────────────────
console.log('═'.repeat(80));
console.log('CLIENT → SERVER MESSAGES (port 9512 destination)');
console.log('═'.repeat(80));

let msgNum = 0;
for (const [key, data] of Object.entries(streamData)) {
  if (!key.includes(':9512')) continue; // only client→server
  const isCS = key.endsWith(':9512') || key.match(/->.*:9512/);
  if (!isCS) continue;

  console.log(`\nStream: ${key}  (${data.length} bytes)`);

  let off = 0;
  while (off + 4 <= data.length) {
    const msgLen = data.readUInt32BE(off);
    if (msgLen === 0 || off + 4 + msgLen > data.length) {
      // show remaining bytes
      const rem = data.slice(off);
      if (rem.length > 0) {
        console.log(`  [leftover ${rem.length} bytes]: ${rem.slice(0, 64).toString('hex')}`);
      }
      break;
    }
    off += 4;
    const payload = data.slice(off, off + msgLen);
    off += msgLen;
    msgNum++;

    // quick decode
    let action = '?';
    let fields = {};
    try {
      const dec = decodeFields(payload, true);
      fields = dec.fields;
      if ('Action' in fields) action = `0x${fields.Action.toString(16)}`;
    } catch(e) {}

    const actionNum = parseInt(action, 16);
    const isRun = actionNum === 7;
    const marker = isRun ? ' *** RUN ***' : '';

    console.log(`\n  MSG #${msgNum} Action=${action}${marker}  len=${msgLen}`);

    if (isRun) {
      // Show full raw hex for Run actions
      console.log(`    RAW HEX: ${payload.toString('hex')}`);
      console.log(`    DECODED: ${JSON.stringify(fields, null, 2)}`);
    } else {
      // Short summary for others
      const summary = JSON.stringify(fields).slice(0, 200);
      console.log(`    ${summary}`);
    }
  }
}

console.log('\n\n' + '═'.repeat(80));
console.log('SUMMARY of client→server Run(0x07) actions:');
console.log('═'.repeat(80));
// Re-parse to summarize Run actions
msgNum = 0;
for (const [key, data] of Object.entries(streamData)) {
  if (!key.includes(':9512')) continue;
  const isCS = key.endsWith(':9512') || key.match(/->.*:9512/);
  if (!isCS) continue;
  let off = 0;
  while (off + 4 <= data.length) {
    const msgLen = data.readUInt32BE(off);
    if (msgLen === 0 || off + 4 + msgLen > data.length) break;
    off += 4;
    const payload = data.slice(off, off + msgLen);
    off += msgLen;
    msgNum++;
    let fields = {};
    try { fields = decodeFields(payload, true).fields; } catch(e) {}
    if (fields.Action === 7) {
      console.log(`  MSG#${msgNum}: Remote="${fields.ID || fields.Remote || '?'}" Action="${fields.Name || fields.Key || '?'}"`);
      // show all extra fields
      for (const [k,v] of Object.entries(fields)) {
        if (k !== 'Action' && k !== 'ID' && k !== 'Remote' && k !== 'Name' && k !== 'Key') {
          console.log(`    ${k} = ${JSON.stringify(v)}`);
        }
      }
    }
  }
}
