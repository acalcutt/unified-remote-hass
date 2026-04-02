#!/usr/bin/env node
/**
 * pcap_debug.js
 * Low-level pcapng inspector to understand link type and raw TCP payload bytes.
 */
'use strict';
const fs = require('fs');
const file = process.argv[2] || 'PCAPdroid_02_Apr_09_37_21.pcapng';
const buf = fs.readFileSync(file);

let le = true;
function r32le(off) { return buf.readUInt32LE(off); }
function r32be(off) { return buf.readUInt32BE(off); }
function r32(off)   { return le ? r32le(off) : r32be(off); }
function r16(off)   { return le ? buf.readUInt16LE(off) : buf.readUInt16BE(off); }

// ── Block-level walk ────────────────────────────────────────────────────────
let off = 0;
const interfaces = []; // link types per interface index
let blockCount = 0;
let epbCount = 0;
let rawPayloads = []; // first 20 raw payloads near port 9512

while (off + 8 <= buf.length) {
  const blkType = r32le(off);  // block type always LE in pcapng

  if (blkType === 0x0A0D0D0A) {
    // Section Header Block
    const bom = buf.readUInt32LE(off + 8);
    le = bom === 0x1A2B3C4D;
    const totalLen = r32(off + 4);
    const maj = r16(off + 12);
    const min = r16(off + 14);
    console.log(`SHB at ${off}: BOM=0x${bom.toString(16)} le=${le} ver=${maj}.${min} len=${totalLen}`);
    off += totalLen;
    continue;
  }

  const totalLen = r32(off + 4);
  if (totalLen < 12 || totalLen > 10_000_000 || off + totalLen > buf.length) {
    console.log(`Bad block at ${off}: type=0x${blkType.toString(16)} totalLen=${totalLen}`);
    break;
  }

  blockCount++;

  if (blkType === 0x00000001) {
    // Interface Description Block
    const linkType = r16(off + 8);
    interfaces.push(linkType);
    console.log(`IDB at ${off}: linkType=${linkType} (${linkTypeName(linkType)})`);
  }

  if (blkType === 0x00000006 || blkType === 0x00000002) {
    // Enhanced Packet Block or Obsolete Packet Block
    epbCount++;
    let ifIdx = 0, capLen, dataOff;
    if (blkType === 0x00000006) {
      ifIdx   = r32(off + 8);
      capLen  = r32(off + 20);
      dataOff = off + 28;
    } else {
      capLen  = r32(off + 12);
      dataOff = off + 16;
    }
    const linkType = interfaces[ifIdx] ?? 1;
    const pktBuf = buf.slice(dataOff, dataOff + capLen);

    if (epbCount <= 5 || rawPayloads.length < 20) {
      // Try to find TCP port 9512 in this packet
      const tcpInfo = extractTcp(pktBuf, linkType);
      if (tcpInfo) {
        if (epbCount <= 10) {
          console.log(`  EPB #${epbCount} linkType=${linkType} capLen=${capLen} TCP ${tcpInfo.src}:${tcpInfo.sport}->${tcpInfo.dst}:${tcpInfo.dport} payLen=${tcpInfo.payload.length}`);
          if (tcpInfo.payload.length > 0) {
            console.log(`  payload hex: ${tcpInfo.payload.slice(0, 64).toString('hex')}`);
          }
        }
        if ((tcpInfo.sport === 9512 || tcpInfo.dport === 9512) && tcpInfo.payload.length > 0) {
          rawPayloads.push(tcpInfo);
        }
      } else if (epbCount <= 5) {
        console.log(`  EPB #${epbCount} linkType=${linkType} capLen=${capLen} -- not TCP or parse fail`);
        console.log(`  raw[0..31]: ${pktBuf.slice(0,32).toString('hex')}`);
      }
    }
  }

  off += totalLen;
}

console.log(`\nTotal blocks: ${blockCount}, EPBs: ${epbCount}`);
console.log(`Interfaces: ${interfaces.map((l,i) => `[${i}]=${l}(${linkTypeName(l)})`).join(', ')}`);
console.log(`Packets targeting port 9512 with payload: ${rawPayloads.length}`);

// Print first 5 raw payloads for inspection
console.log('\n── First 5 port-9512 TCP payloads (raw hex) ──');
for (const p of rawPayloads.slice(0, 5)) {
  console.log(`${p.src}:${p.sport} → ${p.dst}:${p.dport}  len=${p.payload.length}`);
  console.log('  ' + p.payload.toString('hex'));
  console.log();
}

// ── TCP extraction by link type ─────────────────────────────────────────────
function extractTcp(pkt, linkType) {
  let ipOff = 0;

  if (linkType === 1) {
    // Ethernet
    if (pkt.length < 14) return null;
    const etherType = pkt.readUInt16BE(12);
    if (etherType === 0x8100) { ipOff = 18; }
    else if (etherType === 0x0800) { ipOff = 14; }
    else return null;
  } else if (linkType === 101 || linkType === 228) {
    // Raw IPv4
    ipOff = 0;
  } else if (linkType === 239 || linkType === 249) {
    // Some custom/Linux cooked etc — skip
    return null;
  } else {
    // Try raw IP anyway
    if ((pkt[0] & 0xF0) === 0x40) ipOff = 0;
    else return null;
  }

  if (pkt.length < ipOff + 20) return null;
  const ipVerHL = pkt[ipOff];
  if ((ipVerHL >> 4) !== 4) return null;
  const ipHL = (ipVerHL & 0x0F) * 4;
  if (pkt[ipOff + 9] !== 6) return null; // not TCP

  const srcIP = `${pkt[ipOff+12]}.${pkt[ipOff+13]}.${pkt[ipOff+14]}.${pkt[ipOff+15]}`;
  const dstIP = `${pkt[ipOff+16]}.${pkt[ipOff+17]}.${pkt[ipOff+18]}.${pkt[ipOff+19]}`;

  const tcpOff = ipOff + ipHL;
  if (pkt.length < tcpOff + 20) return null;
  const sport = pkt.readUInt16BE(tcpOff);
  const dport = pkt.readUInt16BE(tcpOff + 2);
  const tcpDataOff = tcpOff + ((pkt[tcpOff + 12] >> 4) * 4);
  const payload = pkt.slice(tcpDataOff);

  return { src: srcIP, dst: dstIP, sport, dport, payload };
}

function linkTypeName(n) {
  const names = {1:'Ethernet',101:'Raw IPv4',113:'Linux cooked',228:'IPv4',239:'ERF',249:'Custom'};
  return names[n] || `unknown(${n})`;
}
