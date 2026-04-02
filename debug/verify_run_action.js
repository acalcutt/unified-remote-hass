/**
 * Verify bridge's _build_run_action matches PCAP exactly.
 * Reconstructs the packet-building logic in JS and compares.
 */

// Actual PCAP bytes for the 4 confirmed Run actions
const PCAP_RUNS = {
  volume_mute: Buffer.from(
    '000108416374696f6e000705494400556e69666965642e4d65646961' +
    '00024c61796f75740006436f6e74726f6c73000200024f6e41637469' +
    '6f6e00054e616d6500766f6c756d655f6d757465000008547970650008' +
    '000000085265717565737400070252756e00054e616d6500766f6c756d655f' +
    '6d757465000005536f7572636500616e64726f69642d346231373030333738363837653237630000',
    'hex'),

  volume_up: Buffer.from(
    '000108416374696f6e000705494400556e69666965642e4d65646961' +
    '00024c61796f75740006436f6e74726f6c73000200024f6e41637469' +
    '6f6e00054e616d6500766f6c756d655f7570000008547970650008000000' +
    '085265717565737400070252756e00054e616d6500766f6c756d655f7570' +
    '000005536f7572636500616e64726f69642d346231373030333738363837653237630000',
    'hex'),

  next: Buffer.from(
    '000108416374696f6e000705494400556e69666965642e4d65646961' +
    '00024c61796f75740006436f6e74726f6c73000200024f6e416374696f6e' +
    '00054e616d65006e657874000008547970650008000000085265717565737400' +
    '070252756e00054e616d65006e657874000005536f7572636500616e64726f69' +
    '642d346231373030333738363837653237630000',
    'hex'),

  play_pause: Buffer.from(
    '000108416374696f6e000705494400556e69666965642e4d65646961' +
    '00024c61796f75740006436f6e74726f6c73000200024f6e416374696f6e' +
    '00054e616d6500706c61795f7061757365000008547970650008000000085265' +
    '717565737400070252756e00054e616d6500706c61795f7061757365000005536f' +
    '7572636500616e64726f69642d346231373030333738363837653237630000',
    'hex'),
};

// ── Replicate bridge helper functions ────────────────────────────────────────
function _s(text) {
  return Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([0])]);
}
function _field(typeByte, key, value = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([typeByte]), _s(key), value]);
}
function _wrap(payload) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length);
  return Buffer.concat([len, payload]);
}

function buildRunAction(sourceId, remoteId, buttonName) {
  const on_action = Buffer.concat([
    _field(0x05, 'Name'), _s(buttonName),
    Buffer.from([0x00]),
  ]);
  const control_entry = Buffer.concat([
    _field(0x02, 'OnAction'), on_action,
    _field(0x08, 'Type'), Buffer.from([0x08]),
    Buffer.from([0x00]),
  ]);
  const controls = Buffer.concat([
    _field(0x02, ''), control_entry,
    Buffer.from([0x00]),
  ]);
  const layout = Buffer.concat([
    _field(0x06, 'Controls'), controls,
    Buffer.from([0x00]),
  ]);
  const run_map = Buffer.concat([
    _field(0x05, 'Name'), _s(buttonName),
    Buffer.from([0x00]),
  ]);
  const body = Buffer.concat([
    Buffer.from([0x00, 0x01]),
    _field(0x08, 'Action'), Buffer.from([0x07]),
    _field(0x05, 'ID'),     _s(remoteId),
    _field(0x02, 'Layout'), layout,
    _field(0x08, 'Request'), Buffer.from([0x07]),
    _field(0x02, 'Run'),    run_map,
    _field(0x05, 'Source'), _s(sourceId),
    Buffer.from([0x00]),
  ]);
  return _wrap(body);
}

// ── Compare ──────────────────────────────────────────────────────────────────
const SOURCE = 'android-4b1700378687e27c';
const REMOTE = 'Unified.Media';

let allPassed = true;
for (const [btn, expected] of Object.entries(PCAP_RUNS)) {
  const built = buildRunAction(SOURCE, REMOTE, btn);
  // The PCAP payload is without the 4-byte length prefix; built includes it.
  // Both should match if we compare correctly:
  // expected = payload bytes (no length prefix in PCAP hex above)
  // built = 4-byte-len + payload
  const builtPayload = built.slice(4); // strip length prefix

  if (builtPayload.equals(expected)) {
    console.log(`✅  ${btn}: EXACT MATCH (${expected.length} bytes)`);
  } else {
    allPassed = false;
    console.log(`❌  ${btn}: MISMATCH`);
    console.log(`   expected: ${expected.toString('hex').slice(0, 80)}...`);
    console.log(`   built:    ${builtPayload.toString('hex').slice(0, 80)}...`);
    // Find first diff
    for (let i = 0; i < Math.min(expected.length, builtPayload.length); i++) {
      if (expected[i] !== builtPayload[i]) {
        console.log(`   first diff at byte ${i}: expected 0x${expected[i].toString(16)} got 0x${builtPayload[i].toString(16)}`);
        const ctx = Math.max(0, i - 4);
        console.log(`   context expected: ${expected.slice(ctx, i+8).toString('hex')}`);
        console.log(`   context built:    ${builtPayload.slice(ctx, i+8).toString('hex')}`);
        break;
      }
    }
  }
}

console.log('\n' + (allPassed ? '🎉 All packets verified — bridge encoding is correct!' : '⚠️  Some packets differ — bridge needs fixing'));

// Print the actual PCAP hex from the dump for reference
console.log('\n─── PCAP raw Run action hexes (from pcap_dump_client.js output) ───');
console.log('volume_mute:');
console.log(' ', PCAP_RUNS.volume_mute.toString('hex'));
console.log('volume_up:');
console.log(' ', PCAP_RUNS.volume_up.toString('hex'));
