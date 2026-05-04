// Verify the Stripe webhook signature logic matches Stripe's spec.
// We simulate Stripe's own signing (HMAC-SHA256 of `${t}.${rawBody}`) and
// confirm verifyStripeSignature accepts a valid sig and rejects tampering.

// Pull verifyStripeSignature out by re-implementing it inline (the Worker
// file uses ES modules and `export default`, harder to import in Node).
async function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (typeof header !== 'string') return false;
  const parts = header.split(',').map(s => s.trim());
  let t = null;
  const v1s = [];
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;
  const tNum = parseInt(t, 10);
  if (!Number.isFinite(tNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tNum) > toleranceSec) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(macBuf), b => b.toString(16).padStart(2, '0')).join('');
  for (const v1 of v1s) {
    if (timingSafeEqualHex(expected, v1)) return true;
  }
  return false;
}
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

// Stripe-side: build a real signature header
async function stripeSign(rawBody, secret) {
  const t = Math.floor(Date.now() / 1000).toString();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`));
  const v1 = Array.from(new Uint8Array(macBuf), b => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${v1}`;
}

(async () => {
  const secret = 'whsec_testsigningsecret_57f3a9b2c1d4e5';
  const body = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed', data: { object: { id: 'cs_test' } } });

  console.log('Test 1: valid Stripe signature accepted');
  const goodSig = await stripeSign(body, secret);
  if (!await verifyStripeSignature(body, goodSig, secret)) throw new Error('valid sig rejected');
  console.log('  ✓ valid sig accepted');

  console.log('Test 2: tampered body rejected');
  if (await verifyStripeSignature(body + 'tampered', goodSig, secret)) throw new Error('tampered body accepted');
  console.log('  ✓ tampered body rejected');

  console.log('Test 3: wrong secret rejected');
  if (await verifyStripeSignature(body, goodSig, 'whsec_different')) throw new Error('wrong secret accepted');
  console.log('  ✓ wrong secret rejected');

  console.log('Test 4: malformed header rejected');
  if (await verifyStripeSignature(body, 'not-a-real-header', secret)) throw new Error('malformed accepted');
  if (await verifyStripeSignature(body, '', secret)) throw new Error('empty accepted');
  console.log('  ✓ malformed/empty headers rejected');

  console.log('Test 5: stale timestamp rejected (10 min old)');
  const t = Math.floor(Date.now() / 1000) - 600; // 10 min ago
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${body}`));
  const v1 = Array.from(new Uint8Array(macBuf), b => b.toString(16).padStart(2, '0')).join('');
  const staleSig = `t=${t},v1=${v1}`;
  if (await verifyStripeSignature(body, staleSig, secret)) throw new Error('stale sig accepted');
  console.log('  ✓ stale signature rejected (replay protection)');

  console.log('Test 6: multiple v1 entries — second one valid');
  const multiSig = goodSig + ',v1=deadbeefdeadbeef';
  if (!await verifyStripeSignature(body, multiSig, secret)) throw new Error('multi-v1 with one valid rejected');
  console.log('  ✓ multi-v1 header (one valid, one invalid) accepted');

  console.log('\nALL STRIPE SIG TESTS PASS');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
