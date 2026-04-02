/**
 * Inspect ALL TCP streams in a PCAP file - find mouse data.
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

// ── IP/TCP extraction (linkType=101 Raw IPv4) ──────────────────────────────
function extractTcp(raw) {
  if (raw.length < 20) return null;
  const ihl = (raw[0] & 0x0f) * 4;
  if (raw[9] !== 6) return null; // not TCP
  if (raw.length < ihl + 20) return null;
  const srcIP  = `${raw[12]}.${raw[13]}.${raw[14]}.${raw[15]}`;
  const dstIP  = `${raw[16]}.${raw[17]}.${raw[18]}.${raw[19]}`;
  const srcPort = raw.readUInt16BE(ihl);
  const dstPort = raw.readUInt16BE(ihl + 2);
  const seq     = raw.readUInt32BE(ihl + 4);
  const flags   = raw[ihl + 13];
  const dataOff = ((raw[ihl + 12] >> 4) * 4);
  const payload = raw.slice(ihl + dataOff);
  return { srcIP, dstIP, srcPort, dstPort, seq, flags, payload };
}

// ── Collect all streams ────────────────────────────────────────────────────
const streams = {};
const packets = readPcapng(buf);
console.log(`Total packets in PCAP: ${packets.length}`);

for (const raw of packets) {
  const t = extractTcp(raw);
  if (!t) continue;
  // Normalize stream key (both directions)
  const key = `${t.srcIP}:${t.srcPort}<->${t.dstIP}:${t.dstPort}`;
  const revKey = `${t.dstIP}:${t.dstPort}<->${t.srcIP}:${t.srcPort}`;
  const streamKey = streams[key] ? key : streams[revKey] ? revKey : key;
  if (!streams[streamKey]) streams[streamKey] = { cs: [], sc: [] };

  // Determine direction
  const isCS = t.dstPort === 9512 || t.dstPort === 9511 || t.srcPort > t.dstPort;
  const dir = (t.srcIP.startsWith('10.') || t.srcIP.startsWith('192.168.1.')) 
               && !t.srcIP.endsWith('.92') ? 'cs' : 'sc';
  
  if (t.payload.length > 0) {
    streams[streamKey][dir].push({ seq: t.seq, data: t.payload });
  }
}

console.log('\n═══ ALL TCP STREAMS ═══\n');
for (const [key, {cs, sc}] of Object.entries(streams)) {
  const csBytes = cs.reduce((a, s) => a + s.data.length, 0);
  const scBytes = sc.reduce((a, s) => a + s.data.length, 0);
  console.log(`  ${key}`);
  console.log(`    C→S: ${cs.length} segments, ${csBytes} bytes`);
  console.log(`    S→C: ${sc.length} segments, ${scBytes} bytes`);
}

// ── Now look at ALL ports, show distinct ports ─────────────────────────────
console.log('\n═══ ALL DISTINCT PORTS ═══\n');
const portSet = new Set();
for (const raw of packets) {
  const t = extractTcp(raw);
  if (!t) continue;
  portSet.add(t.srcPort);
  portSet.add(t.dstPort);
}
const ports = [...portSet].sort((a,b) => a-b);
console.log(ports.join(', '));

// ── Look at ALL packets and group by dest port ─────────────────────────────
console.log('\n═══ DATA PACKETS BY DEST PORT ═══\n');
const byDest = {};
for (const raw of packets) {
  const t = extractTcp(raw);
  if (!t || t.payload.length === 0) continue;
  if (!byDest[t.dstPort]) byDest[t.dstPort] = 0;
  byDest[t.dstPort] += t.payload.length;
}
for (const [port, bytes] of Object.entries(byDest).sort((a,b) => b[1]-a[1])) {
  console.log(`  dst port ${port}: ${bytes} bytes`);
}

// ── Deep dump of ALL non-9512 TCP streams with data ────────────────────────
console.log('\n═══ NON-9512 TCP STREAMS (raw hex) ═══\n');
const streamsBySrc = {};
for (const raw of packets) {
  const t = extractTcp(raw);
  if (!t || t.payload.length === 0) continue;
  if (t.srcPort === 9512 || t.dstPort === 9512) continue;
  const key = `${t.srcIP}:${t.srcPort}->${t.dstIP}:${t.dstPort}`;
  if (!streamsBySrc[key]) streamsBySrc[key] = [];
  streamsBySrc[key].push({ seq: t.seq, data: t.payload });
}
for (const [key, segs] of Object.entries(streamsBySrc)) {
  segs.sort((a,b) => a.seq - b.seq);
  const total = segs.reduce((a,s)=>a+s.data.length,0);
  console.log(`  ${key}  (${total} bytes)`);
  const allData = Buffer.concat(segs.map(s=>s.data));
  // Try ASCII decode
  const ascii = allData.slice(0, 200).toString('ascii').replace(/[^\x20-\x7e]/g, '.');
  console.log(`    ASCII: ${ascii}`);
  console.log(`    HEX:   ${allData.slice(0, 128).toString('hex')}`);
  console.log();
}

// ── Full dump of 9512 streams, both directions ─────────────────────────────
console.log('\n═══ PORT 9512 FULL STREAM DATA ═══\n');
const streams9512 = {};
for (const raw of packets) {
  const t = extractTcp(raw);
  if (!t || t.payload.length === 0) continue;
  if (t.srcPort !== 9512 && t.dstPort !== 9512) continue;
  const dir = t.dstPort === 9512 ? 'cs' : 'sc';
  const key = t.dstPort === 9512 
    ? `${t.srcIP}:${t.srcPort}->:9512`
    : `${t.dstIP}:${t.dstPort}->:9512`;
  if (!streams9512[key]) streams9512[key] = { cs: [], sc: [] };
  streams9512[key][dir].push({ seq: t.seq, data: t.payload });
}

for (const [key, {cs, sc}] of Object.entries(streams9512)) {
  // Reassemble C→S
  cs.sort((a,b)=>{
    let d=a.seq-b.seq;
    if(d>2e9)d-=4294967296;
    if(d<-2e9)d+=4294967296;
    return d;
  });
  const csData = Buffer.concat([...new Map(cs.map(s=>[s.seq,s])).values()].map(s=>s.data));

  console.log(`Stream ${key}`);
  console.log(`  C→S total: ${csData.length} bytes`);
  console.log(`  C→S hex: ${csData.toString('hex')}`);
  console.log();

  // Parse as UR messages
  console.log('  Parsed C→S UR messages:');
  let off = 0;
  while (off + 4 <= csData.length) {
    const msgLen = csData.readUInt32BE(off);
    if (msgLen === 0 || off + 4 + msgLen > csData.length) {
      console.log(`    [leftover ${csData.length - off} bytes]: ${csData.slice(off).toString('hex')}`);
      break;
    }
    off += 4;
    const payload = csData.slice(off, off + msgLen);
    off += msgLen;
    // Show action byte and raw hex
    const prefix = payload.slice(0, 2).toString('hex');
    const actionByte = payload[2] === 0x08 ? payload.slice(0, 20).toString('hex') : '?';
    console.log(`    len=${msgLen} prefix=${prefix} raw=${payload.toString('hex')}`);
  }
}
