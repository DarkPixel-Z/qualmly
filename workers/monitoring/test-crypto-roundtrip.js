// One-shot test: prove the browser's _encryptApiKey blob format round-trips
// through the Worker's decryptKey, and vice versa. Both sides must agree on:
//   - PBKDF2 params (300k iters, SHA-256)
//   - AES-GCM key length (256)
//   - Salt (16 bytes), IV (12 bytes)
//   - JSON shape: { v, salt: number[], iv: number[], ct: number[] }
// If this script prints "ALL ROUND-TRIPS OK" we're good. If it throws, we have
// a P0 — the cron will silently fail to scan any user.

// === BROWSER SIDE (copied verbatim from index.html lines ~2478–2515) =========
async function _deriveKey(passphrase, salt) {
  const pwKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 300000, hash: "SHA-256" },
    pwKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function _encryptApiKey(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await _deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );
  return {
    v: 1,
    salt: Array.from(salt),
    iv: Array.from(iv),
    ct: Array.from(new Uint8Array(ct))
  };
}

async function _decryptApiKey(blob, passphrase) {
  const salt = new Uint8Array(blob.salt);
  const iv = new Uint8Array(blob.iv);
  const ct = new Uint8Array(blob.ct);
  const aesKey = await _deriveKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
  return new TextDecoder().decode(pt);
}

// === WORKER SIDE (copied verbatim from workers/monitoring/src/index.js) ======
async function encryptKey(plaintext, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pwKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 300000, hash: 'SHA-256' },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(plaintext));
  return {
    v: 1,
    salt: Array.from(salt),
    iv: Array.from(iv),
    ct: Array.from(new Uint8Array(ct))
  };
}

async function decryptKey(blob, passphrase) {
  const salt = new Uint8Array(blob.salt);
  const iv = new Uint8Array(blob.iv);
  const ct = new Uint8Array(blob.ct);
  const enc = new TextEncoder();
  const pwKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 300000, hash: 'SHA-256' },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return new TextDecoder().decode(pt);
}

// === ROUND-TRIP TESTS ========================================================
async function main() {
  const realKey = "sk-ant-api03-_test-key-0123456789abcdefghijklmnop_qrstuvwxyz_ABCDEF_GHIJKLMNOPQRSTUV_W";
  const passphrase = "correct-horse-battery-staple-12345";

  console.log("Test 1: browser encrypts → worker decrypts");
  const blob1 = await _encryptApiKey(realKey, passphrase);
  // Confirm shape before passing to worker side
  if (blob1.v !== 1) throw new Error("blob.v wrong");
  if (!Array.isArray(blob1.salt) || blob1.salt.length !== 16) throw new Error("salt shape wrong: len=" + blob1.salt.length);
  if (!Array.isArray(blob1.iv)   || blob1.iv.length !== 12)   throw new Error("iv shape wrong: len=" + blob1.iv.length);
  if (!Array.isArray(blob1.ct)   || blob1.ct.length === 0)    throw new Error("ct empty");
  // Round-trip via JSON to simulate the network hop
  const wireFormat = JSON.parse(JSON.stringify(blob1));
  const decrypted1 = await decryptKey(wireFormat, passphrase);
  if (decrypted1 !== realKey) throw new Error("decrypted mismatch");
  console.log("  ✓ browser→worker round-trip OK");

  console.log("Test 2: worker encrypts → browser decrypts");
  const blob2 = await encryptKey(realKey, passphrase);
  const wireFormat2 = JSON.parse(JSON.stringify(blob2));
  const decrypted2 = await _decryptApiKey(wireFormat2, passphrase);
  if (decrypted2 !== realKey) throw new Error("worker→browser decrypted mismatch");
  console.log("  ✓ worker→browser round-trip OK");

  console.log("Test 3: wrong passphrase rejected");
  let threw = false;
  try { await decryptKey(JSON.parse(JSON.stringify(blob1)), "wrong-passphrase"); }
  catch (e) { threw = true; }
  if (!threw) throw new Error("wrong passphrase should have thrown");
  console.log("  ✓ wrong passphrase throws (as expected)");

  console.log("Test 4: empty string round-trip");
  const blob4 = await _encryptApiKey("", passphrase);
  const decrypted4 = await decryptKey(JSON.parse(JSON.stringify(blob4)), passphrase);
  if (decrypted4 !== "") throw new Error("empty-string round-trip failed");
  console.log("  ✓ empty string round-trip OK");

  console.log("Test 5: long key (4096 chars) round-trip");
  const longKey = "x".repeat(4096);
  const blob5 = await _encryptApiKey(longKey, passphrase);
  const decrypted5 = await decryptKey(JSON.parse(JSON.stringify(blob5)), passphrase);
  if (decrypted5 !== longKey) throw new Error("long-key round-trip failed");
  console.log("  ✓ 4096-char key round-trip OK");

  console.log("Test 6: unicode passphrase + emoji in plaintext");
  const blob6 = await _encryptApiKey("key—🔑—value", "пароль 中文 ñoño 🌳");
  const decrypted6 = await decryptKey(JSON.parse(JSON.stringify(blob6)), "пароль 中文 ñoño 🌳");
  if (decrypted6 !== "key—🔑—value") throw new Error("unicode round-trip failed");
  console.log("  ✓ unicode round-trip OK");

  console.log("Test 7: simulating Worker's wrapped-passphrase pattern");
  // The Worker stores: encryptKey(userPassphrase, env.SERVICE_PASSPHRASE_SALT)
  // Then cron: decryptKey(wrappedBlob, env.SERVICE_PASSPHRASE_SALT) → userPassphrase
  // Then: decryptKey(userKeyBlob, userPassphrase) → anthropicKey
  const userPass = "user-chosen-strong-passphrase-2026!";
  const serviceSalt = "WORKER_SECRET_NEVER_LEAKS_57f3a9b2c1d4e5";
  const userKeyBlob = await _encryptApiKey(realKey, userPass);
  const wrappedPass = await encryptKey(userPass, serviceSalt);
  // Cron unwraps:
  const recoveredPass = await decryptKey(JSON.parse(JSON.stringify(wrappedPass)), serviceSalt);
  if (recoveredPass !== userPass) throw new Error("wrapped-pass unwrap failed");
  const recoveredKey = await decryptKey(JSON.parse(JSON.stringify(userKeyBlob)), recoveredPass);
  if (recoveredKey !== realKey) throw new Error("two-stage unwrap failed");
  console.log("  ✓ dual-key unwrap (cron simulation) OK");

  console.log("\nALL ROUND-TRIPS OK");
}

main().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
