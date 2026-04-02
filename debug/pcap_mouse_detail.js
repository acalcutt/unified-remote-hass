/**
 * Decode UDP mouse packets properly - handle duplicate empty-string keys as arrays.
 * Also shows Click with all button types.
 */
const fs = require('fs');
const path = require('path');

const pcapFile = process.argv[2] || 'PCAPdroid_02_Apr_17_46_42.pcapng';
const buf = fs.readFileSync(path.resolve(__dirname, pcapFile));

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

function extractUdp(raw) {
  if (raw.length < 20) return null;
  const ihl = (raw[0] & 0x0f) * 4;
  if (raw[9] !== 17) return null;
  if (raw.length < ihl + 8) return null;
  const srcIP  = `${raw[12]}.${raw[13]}.${raw[14]}.${raw[15]}`;
  const dstIP  = `${raw[16]}.${raw[17]}.${raw[18]}.${raw[19]}`;
  const srcPort = raw.readUInt16BE(ihl);
  const dstPort = raw.readUInt16BE(ihl + 2);
  const payload = raw.slice(ihl + 8);
  return { srcIP, dstIP, srcPort, dstPort, payload };
}

// Decoder that keeps duplicate keys as an array
function decode(buf, off) {
  const fields = {};
  while (off < buf.length) {
    const t = buf[off++];
    if (t === 0x00) break;
    let kEnd = off;
    while (kEnd < buf.length && buf[kEnd] !== 0) kEnd++;
    const key = buf.slice(off, kEnd).toString('utf8');
    off = kEnd + 1;
    if (off >= buf.length) break;

    let val;
    switch (t) {
      case 0x08: val = buf[off++]; break;
      case 0x05: { let e=off; while(e<buf.length&&buf[e]!==0)e++; val=buf.slice(off,e).toString('utf8'); off=e+1; break; }
      case 0x04: { val=buf.readFloatBE(off); off+=4; break; }
      case 0x0b: { val=buf.readInt32BE(off); off+=4; break; }
      case 0x02:
      case 0x06: { const r=decode(buf,off); val=r.fields; off=r.off; break; }
      case 0x03: { if(off+4<=buf.length){const l=buf.readUInt32BE(off);off+=4;val=`<bytes ${l}>`;off+=l;} break; }
      default:   { val=`?${t.toString(16)}`; off++; break; }
    }

    // Handle duplicate keys: turn into array
    if (key in fields) {
      if (!Array.isArray(fields[key])) fields[key] = [fields[key]];
      fields[key].push(val);
    } else {
      fields[key] = val;
    }
  }
  return { fields, off };
}

// ── Collect UDP packets ────────────────────────────────────────────────────
const udpPackets = [];
for (const raw of readPcapng(buf)) {
  const u = extractUdp(raw);
  if (!u) continue;
  if (u.dstPort !== 9512) continue;
  if (u.dstIP !== '192.168.0.92') continue;
  if (u.payload.length < 4) continue;
  udpPackets.push(u.payload);
}

console.log(`Total C→S UDP packets: ${udpPackets.length}\n`);

// Show first 10 MoveBy packets with X/Y values
console.log('═══ MoveBy samples (first 15 with non-zero values) ═══\n');
let moveCount = 0;
for (const p of udpPackets) {
  const payLen = p.readUInt32BE(0);
  if (payLen === 0 || payLen > p.length - 4) continue;
  const body = p.slice(4, 4 + payLen);
  const {fields} = decode(body, 2);
  if (fields.Action !== 7) continue;
  const run = fields.Run || {};
  if (run.Name !== 'MoveBy') continue;

  // Extract X/Y from Extras.Values (array of {Key, Value} objects)
  const vals = run.Extras?.Values;
  let x = null, y = null;
  const entries = Array.isArray(vals?.['']) ? vals[''] : vals?.[''] ? [vals['']] : [];
  for (const e of entries) {
    if (e.Key === 'X') x = e.Value;
    if (e.Key === 'Y') y = e.Value;
  }

  if (x === '0' && y === '0') continue; // skip zero moves
  if (moveCount >= 15) break;
  moveCount++;
  console.log(`  MoveBy  X=${x}  Y=${y}`);
  if (moveCount === 1) {
    console.log(`  RAW (${body.length} bytes): ${body.toString('hex')}`);
    console.log(`  Full fields: ${JSON.stringify(fields, null, 2)}`);
  }
}

// Show all Click packets
console.log('\n═══ All Click packets ═══\n');
const clickButtons = {};
for (const p of udpPackets) {
  const payLen = p.readUInt32BE(0);
  if (payLen === 0 || payLen > p.length - 4) continue;
  const body = p.slice(4, 4 + payLen);
  const {fields} = decode(body, 2);
  if (fields.Action !== 7) continue;
  const run = fields.Run || {};
  if (run.Name !== 'Click') continue;

  const vals = run.Extras?.Values;
  const entries = Array.isArray(vals?.['']) ? vals[''] : vals?.[''] ? [vals['']] : [];
  let btn = '?';
  for (const e of entries) {
    if (e.Key === 'Button') btn = e.Value;
  }
  clickButtons[btn] = (clickButtons[btn]||0) + 1;
  if (Object.keys(clickButtons).length <= 5 && clickButtons[btn] === 1) {
    console.log(`  Click  Button="${btn}"`);
    console.log(`  RAW: ${body.toString('hex')}`);
    console.log();
  }
}
console.log('Click button counts:', clickButtons);

// ── Show the Session-handshake packet (Action 0x0b) ────────────────────────
console.log('\n═══ UDP Action 0x0b (session init) ═══\n');
for (const p of udpPackets) {
  const payLen = p.readUInt32BE(0);
  if (payLen === 0 || payLen > p.length - 4) continue;
  const body = p.slice(4, 4 + payLen);
  const {fields} = decode(body, 2);
  if (fields.Action !== 0x0b) continue;
  console.log(`  RAW (${body.length} bytes): ${body.toString('hex')}`);
  console.log(`  Fields: ${JSON.stringify(fields, null, 2)}`);
  break;
}

// ── Show structure of a MoveBy with BOTH X and Y (full raw) ───────────────
console.log('\n═══ First MoveBy with non-zero X and non-zero Y (annotated) ═══\n');
for (const p of udpPackets) {
  const payLen = p.readUInt32BE(0);
  if (payLen === 0 || payLen > p.length - 4) continue;
  const body = p.slice(4, 4 + payLen);
  const {fields} = decode(body, 2);
  if (fields.Action !== 7) continue;
  const run = fields.Run || {};
  if (run.Name !== 'MoveBy') continue;
  const vals = run.Extras?.Values;
  const entries = Array.isArray(vals?.['']) ? vals[''] : vals?.[''] ? [vals['']] : [];
  let x = null, y = null;
  for (const e of entries) {
    if (e.Key === 'X') x = e.Value;
    if (e.Key === 'Y') y = e.Value;
  }
  if (x !== null && y !== null && x !== '0' && y !== '0') {
    console.log(`X="${x}"  Y="${y}"`);
    console.log(`RAW (${body.length} bytes):\n  ${body.toString('hex')}`);
    // Annotate
    const h = body.toString('hex');
    // find X value
    const xValHex = Buffer.from(x + '\0', 'utf8').toString('hex');
    const yValHex = Buffer.from(y + '\0', 'utf8').toString('hex');
    console.log(`\n  X value "${x}" as hex: ${xValHex}`);
    console.log(`  Y value "${y}" as hex: ${yValHex}`);
    break;
  }
}
