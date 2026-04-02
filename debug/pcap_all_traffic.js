/**
 * Inspect ALL packets in PCAP — TCP and UDP, all ports.
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
    if (blockType === 0x00000006) { // EPB
      const capturedLen = buf.readUInt32LE(off + 20);
      const data = buf.slice(off + 28, off + 28 + capturedLen);
      packets.push(data);
    }
    off += blockLen;
  }
  return packets;
}

// ── Parse IPv4 packet ──────────────────────────────────────────────────────
function parseIPv4(raw) {
  if (raw.length < 20) return null;
  const ihl = (raw[0] & 0x0f) * 4;
  const proto = raw[9]; // 6=TCP, 17=UDP
  const srcIP  = `${raw[12]}.${raw[13]}.${raw[14]}.${raw[15]}`;
  const dstIP  = `${raw[16]}.${raw[17]}.${raw[18]}.${raw[19]}`;
  if (raw.length < ihl) return null;
  const transport = raw.slice(ihl);
  
  if (proto === 6) { // TCP
    if (transport.length < 20) return null;
    const srcPort = transport.readUInt16BE(0);
    const dstPort = transport.readUInt16BE(2);
    const seq     = transport.readUInt32BE(4);
    const dataOff = ((transport[12] >> 4) * 4);
    const payload = transport.slice(dataOff);
    return { proto: 'TCP', srcIP, dstIP, srcPort, dstPort, seq, payload };
  } else if (proto === 17) { // UDP
    if (transport.length < 8) return null;
    const srcPort = transport.readUInt16BE(0);
    const dstPort = transport.readUInt16BE(2);
    const payload = transport.slice(8);
    return { proto: 'UDP', srcIP, dstIP, srcPort, dstPort, payload };
  }
  return { proto: `proto${proto}`, srcIP, dstIP, srcPort: 0, dstPort: 0, payload: Buffer.alloc(0) };
}

const packets = readPcapng(buf);
console.log(`Total PCAPNG packets: ${packets.length}\n`);

// Stats
const stats = {};
let udpCount = 0, tcpCount = 0;
const udpStreams = {};
const tcpStreams = {};

for (const raw of packets) {
  const p = parseIPv4(raw);
  if (!p) continue;
  
  const key = `${p.proto} ${p.srcIP}:${p.srcPort}->${p.dstIP}:${p.dstPort}`;
  if (!stats[key]) stats[key] = { count: 0, bytes: 0 };
  stats[key].count++;
  stats[key].bytes += p.payload.length;

  if (p.proto === 'UDP') {
    udpCount++;
    const k = `${p.srcIP}:${p.srcPort}<->${p.dstIP}:${p.dstPort}`;
    const rk = `${p.dstIP}:${p.dstPort}<->${p.srcIP}:${p.srcPort}`;
    const sk = udpStreams[k] ? k : udpStreams[rk] ? rk : k;
    if (!udpStreams[sk]) udpStreams[sk] = [];
    if (p.payload.length > 0) udpStreams[sk].push(p.payload);
  } else if (p.proto === 'TCP') {
    tcpCount++;
    if (p.payload.length > 0) {
      const k = `${p.srcIP}:${p.srcPort}->${p.dstIP}:${p.dstPort}`;
      if (!tcpStreams[k]) tcpStreams[k] = [];
      tcpStreams[k].push({ seq: p.seq, data: p.payload });
    }
  }
}

console.log('═══ ALL PACKET FLOWS ═══\n');
for (const [key, s] of Object.entries(stats).sort((a,b) => b[1].bytes - a[1].bytes)) {
  if (s.bytes > 0) console.log(`  ${key}  pkts=${s.count}  bytes=${s.bytes}`);
}

// ── UDP detailed dump ──────────────────────────────────────────────────────
console.log('\n═══ UDP PAYLOADS ═══\n');
if (Object.keys(udpStreams).length === 0) {
  console.log('  No UDP traffic found.');
} else {
  for (const [key, payloads] of Object.entries(udpStreams)) {
    console.log(`  ${key}  (${payloads.length} packets)`);
    for (let i = 0; i < Math.min(payloads.length, 5); i++) {
      const p = payloads[i];
      console.log(`    [${i}] len=${p.length} hex=${p.slice(0,32).toString('hex')} ascii="${p.slice(0,32).toString('ascii').replace(/[^\x20-\x7e]/g,'.')}"`);
    }
    if (payloads.length > 5) console.log(`    ... and ${payloads.length-5} more`);
    console.log();
  }
}

// ── TCP non-9512 streams ───────────────────────────────────────────────────
console.log('\n═══ TCP NON-9512 STREAMS ═══\n');
let hasOther = false;
for (const [key, segs] of Object.entries(tcpStreams)) {
  if (key.includes(':9512')) continue;
  hasOther = true;
  segs.sort((a,b) => {
    let d = a.seq - b.seq;
    if (d > 2e9) d -= 4294967296;
    if (d < -2e9) d += 4294967296;
    return d;
  });
  const data = Buffer.concat(segs.map(s=>s.data));
  console.log(`  ${key}  (${data.length} bytes)`);
  console.log(`  hex: ${data.slice(0,128).toString('hex')}`);
  console.log(`  ascii: ${data.slice(0,128).toString('ascii').replace(/[^\x20-\x7e]/g,'.')}`);
  console.log();
}
if (!hasOther) console.log('  None (only port 9512 used).\n');

// ── 9512 TCP full decode ───────────────────────────────────────────────────
console.log('\n═══ PORT 9512 C→S: ALL MESSAGES DECODED ═══\n');

// Reassemble 9512 C→S
const cs9512 = {};
for (const [key, segs] of Object.entries(tcpStreams)) {
  if (!key.match(/->.*:9512/)) continue;
  segs.sort((a,b)=>{let d=a.seq-b.seq;if(d>2e9)d-=4294967296;if(d<-2e9)d+=4294967296;return d;});
  const data = Buffer.concat([...new Map(segs.map(s=>[s.seq,s.data])).values()]);
  cs9512[key] = data;
}

function decodeUR(payload) {
  const fields = {};
  let off = 2; // skip 00 01 prefix
  while (off < payload.length) {
    const t = payload[off++];
    if (t === 0x00) break;
    let kEnd = off;
    while (kEnd < payload.length && payload[kEnd] !== 0) kEnd++;
    const key = payload.slice(off, kEnd).toString('utf8');
    off = kEnd + 1;
    if (off >= payload.length) break;
    if (t === 0x08) { fields[key] = payload[off++]; }
    else if (t === 0x05) { let e=off; while(e<payload.length&&payload[e]!==0)e++; fields[key]=payload.slice(off,e).toString('utf8'); off=e+1; }
    else if (t === 0x02 || t === 0x06) { const r=decodeUR2(payload,off); fields[key]=r.fields; off=r.off; }
    else if (t === 0x04) { if(off+4<=payload.length){fields[key]=payload.readFloatBE(off);} off+=4; }
    else if (t === 0x03) { if(off+4<=payload.length){const l=payload.readUInt32BE(off);off+=4;fields[key]=`<bytes ${l}>`;off+=l;} else break; }
    else { fields[`?${t.toString(16)}:${key}`]=payload[off++]; }
  }
  return fields;
}
function decodeUR2(buf, start) {
  const fields = {};
  let off = start;
  while (off < buf.length) {
    const t = buf[off++];
    if (t === 0x00) break;
    let kEnd = off;
    while (kEnd < buf.length && buf[kEnd] !== 0) kEnd++;
    const key = buf.slice(off, kEnd).toString('utf8');
    off = kEnd + 1;
    if (off >= buf.length) break;
    if (t === 0x08) { fields[key] = buf[off++]; }
    else if (t === 0x05) { let e=off; while(e<buf.length&&buf[e]!==0)e++; fields[key]=buf.slice(off,e).toString('utf8'); off=e+1; }
    else if (t === 0x02 || t === 0x06) { const r=decodeUR2(buf,off); fields[key]=r.fields; off=r.off; }
    else if (t === 0x04) { if(off+4<=buf.length){fields[key]=buf.readFloatBE(off);} off+=4; }
    else if (t === 0x03) { if(off+4<=buf.length){const l=buf.readUInt32BE(off);off+=4;fields[key]=`<bytes ${l}>`;off+=l;} else { off=buf.length; break; } }
    else { fields[`?${t.toString(16)}:${key}`]=buf[off++]; }
  }
  return { fields, off };
}

for (const [key, data] of Object.entries(cs9512)) {
  console.log(`Stream: ${key}  (${data.length} bytes)`);
  let off = 0, n = 0;
  while (off + 4 <= data.length) {
    const msgLen = data.readUInt32BE(off);
    if (msgLen === 0 || off + 4 + msgLen > data.length) {
      console.log(`  [remaining ${data.length-off} bytes]: ${data.slice(off).toString('hex')}`);
      break;
    }
    off += 4;
    const payload = data.slice(off, off + msgLen);
    off += msgLen;
    n++;
    const fields = decodeUR(payload);
    const action = fields.Action !== undefined ? `0x${fields.Action.toString(16)}` : '?';
    const isRun = fields.Action === 7;
    console.log(`\n  MSG #${n} Action=${action}${isRun?' *** RUN ***':''}  len=${msgLen}`);
    if (isRun) {
      console.log(`  RAW: ${payload.toString('hex')}`);
      console.log(`  DECODED: ${JSON.stringify(fields, null, 4)}`);
    } else {
      console.log(`  ${JSON.stringify(fields).slice(0,300)}`);
    }
  }
}
