/**
 * Qualmly Continuous Monitoring — Cloudflare Worker
 *
 * What it does:
 *   - Cron-triggered scheduler runs every hour
 *   - Reads the list of registered watch targets from KV
 *   - For targets due (last_scan + interval < now), runs a scan
 *   - Diff against the previous result; if findings changed, send email
 *   - Stores latest result + history in KV for the user to fetch
 *
 * Architecture (BYOK):
 *   - User signs up with their Anthropic API key (encrypted with their email-derived key)
 *   - User registers a watch target (URL + scan interval + email)
 *   - Worker calls Anthropic from the user's encrypted key (decrypted in-memory only)
 *   - User pays $99/year for the watch slot — separate from the free OSS tool
 *   - Cancel anytime; data deleted on cancel
 *
 * Status: SCAFFOLD. Routes work and KV reads/writes work. Wire-up to a real
 * Anthropic prompt + email sender (Resend / Mailgun) is the remaining ~3
 * days of work.
 */

const QUALMLY_VERSION = 'monitor-v0.1.0-scaffold';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': 'https://qualmly.dev',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    try {
      // Public health check
      if (path === '/' || path === '/health') {
        return json({ ok: true, version: QUALMLY_VERSION });
      }

      // ── User registration / API-key encryption ─────────────────────────────
      if (path === '/api/register' && method === 'POST') {
        return handleRegister(request, env);
      }

      // ── Watch target CRUD ──────────────────────────────────────────────────
      if (path === '/api/watch' && method === 'POST') {
        return handleAddWatch(request, env);
      }
      if (path === '/api/watch' && method === 'GET') {
        return handleListWatches(request, env);
      }
      if (path.startsWith('/api/watch/') && method === 'DELETE') {
        const id = path.split('/').pop();
        return handleDeleteWatch(request, env, id);
      }

      // ── Latest result + history fetch ──────────────────────────────────────
      if (path.startsWith('/api/watch/') && path.endsWith('/results') && method === 'GET') {
        const id = path.split('/')[3];
        return handleGetResults(request, env, id);
      }

      // ── Webhook: Stripe subscription lifecycle (if using Stripe) ──────────
      if (path === '/webhooks/stripe' && method === 'POST') {
        return handleStripeWebhook(request, env);
      }

      return json({ error: 'not found', path }, 404);
    } catch (err) {
      console.error('[monitor]', err && err.stack);
      return json({ error: err && err.message ? err.message : String(err) }, 500);
    }
  },

  /**
   * Cron handler — runs every hour per wrangler.toml schedule.
   * Loops through all registered watch targets, runs scans where due,
   * sends email diffs.
   */
  async scheduled(event, env, ctx) {
    console.log('[monitor] cron fired:', event.cron, new Date().toISOString());
    ctx.waitUntil(runScheduledScans(env));
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Scan scheduler
// ──────────────────────────────────────────────────────────────────────────────
async function runScheduledScans(env) {
  // List all keys in WATCHES KV namespace
  const list = await env.WATCHES.list({ prefix: 'watch:' });
  const now = Date.now();
  let scanned = 0;
  let skipped = 0;

  for (const key of list.keys) {
    const watchJson = await env.WATCHES.get(key.name);
    if (!watchJson) continue;
    const watch = JSON.parse(watchJson);

    const intervalMs = (watch.intervalDays || 7) * 24 * 60 * 60 * 1000;
    const dueAt = (watch.lastScanAt || 0) + intervalMs;

    if (now < dueAt) { skipped++; continue; }
    if (watch.paused) { skipped++; continue; }
    if (!watch.subscriptionActive) { skipped++; continue; }

    try {
      await runScanForWatch(watch, env);
      watch.lastScanAt = now;
      await env.WATCHES.put(key.name, JSON.stringify(watch));
      scanned++;
    } catch (err) {
      console.error('[monitor] scan failed for', watch.id, err && err.message);
    }
  }
  console.log(`[monitor] scheduled run: scanned=${scanned} skipped=${skipped} total=${list.keys.length}`);
}

async function runScanForWatch(watch, env) {
  // 1. Decrypt the user's Anthropic key (uses passphrase derived from the user's
  //    encrypted-storage scheme; mirrors the qualmly.dev AES-GCM design).
  // 2. POST to Anthropic /v1/messages with the same App QA prompt qualmly.dev uses.
  // 3. Parse the JSON response.
  // 4. Compare to previous result stored at HISTORY:<id>:latest.
  // 5. If findings changed materially (new fail, new warn, score drop ≥10),
  //    send email via Resend/Mailgun with a diff summary + link to qualmly.dev/r/<hash>
  // 6. Store new result at HISTORY:<id>:latest and append to HISTORY:<id>:list
  //
  // SCAFFOLD: full implementation pending. The KV reads/writes below show the
  // intended data shape.

  const newResult = {
    scannedAt: Date.now(),
    score: 0,
    findings: [],
    rawHash: 'pending',
    cost: 0
  };

  const prevJson = await env.HISTORY.get(`history:${watch.id}:latest`);
  const prev = prevJson ? JSON.parse(prevJson) : null;

  if (shouldNotify(prev, newResult)) {
    await sendDiffEmail(watch, prev, newResult, env);
  }

  await env.HISTORY.put(`history:${watch.id}:latest`, JSON.stringify(newResult));
  // Append to the rolling list (keep last 30)
  const listKey = `history:${watch.id}:list`;
  const listJson = await env.HISTORY.get(listKey);
  const arr = listJson ? JSON.parse(listJson) : [];
  arr.push({ at: newResult.scannedAt, score: newResult.score, count: newResult.findings.length });
  if (arr.length > 30) arr.shift();
  await env.HISTORY.put(listKey, JSON.stringify(arr));
}

function shouldNotify(prev, next) {
  if (!prev) return true; // first scan
  if (typeof prev.score === 'number' && typeof next.score === 'number') {
    if (prev.score - next.score >= 10) return true; // score dropped ≥10
  }
  // Find new fail-severity findings not present in prev
  const prevTitles = new Set((prev.findings || []).filter(f => f.severity === 'fail').map(f => f.title));
  const newFails = (next.findings || []).filter(f => f.severity === 'fail' && !prevTitles.has(f.title));
  if (newFails.length > 0) return true;
  return false;
}

async function sendDiffEmail(watch, prev, next, env) {
  // Use Resend (resend.com) — set RESEND_API_KEY in worker secret.
  // SCAFFOLD: real call commented out.
  console.log('[monitor] would email', watch.email, 'about', watch.targetUrl);
  /*
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Qualmly Monitor <monitor@qualmly.dev>',
      to: [watch.email],
      subject: `Qualmly: findings changed on ${watch.targetUrl}`,
      html: buildEmailHtml(watch, prev, next)
    })
  });
  */
}

// ──────────────────────────────────────────────────────────────────────────────
// HTTP handlers
// ──────────────────────────────────────────────────────────────────────────────

async function handleRegister(request, env) {
  const body = await request.json();
  const { email, anthropicKey, passphrase } = body;
  if (!email || !anthropicKey || !passphrase) return json({ error: 'missing fields' }, 400);

  // Encrypt the Anthropic key with a passphrase-derived AES-GCM key (mirrors
  // qualmly.dev's _encryptApiKey; see index.html lines ~1846–1860).
  const encrypted = await encryptKey(anthropicKey, passphrase);
  const userId = crypto.randomUUID();

  await env.USERS.put(`user:${userId}`, JSON.stringify({
    id: userId,
    email,
    encryptedKey: encrypted,
    createdAt: Date.now(),
    subscriptionActive: false // becomes true on Stripe webhook
  }));

  return json({ userId });
}

async function handleAddWatch(request, env) {
  const userId = request.headers.get('x-qualmly-user');
  if (!userId) return json({ error: 'missing x-qualmly-user header' }, 401);

  const body = await request.json();
  const { targetUrl, intervalDays, builder, appType, description } = body;
  if (!targetUrl) return json({ error: 'targetUrl required' }, 400);

  const userJson = await env.USERS.get(`user:${userId}`);
  if (!userJson) return json({ error: 'user not found' }, 404);
  const user = JSON.parse(userJson);
  if (!user.subscriptionActive) return json({ error: 'subscription not active' }, 402);

  const watchId = crypto.randomUUID();
  const watch = {
    id: watchId,
    userId,
    email: user.email,
    targetUrl,
    intervalDays: intervalDays || 7,
    builder: builder || 'lovable',
    appType: appType || 'saas',
    description: description || '',
    createdAt: Date.now(),
    lastScanAt: 0,
    paused: false,
    subscriptionActive: true
  };

  await env.WATCHES.put(`watch:${watchId}`, JSON.stringify(watch));
  return json({ watchId });
}

async function handleListWatches(request, env) {
  const userId = request.headers.get('x-qualmly-user');
  if (!userId) return json({ error: 'missing x-qualmly-user header' }, 401);

  const list = await env.WATCHES.list({ prefix: 'watch:' });
  const watches = [];
  for (const key of list.keys) {
    const w = await env.WATCHES.get(key.name);
    if (!w) continue;
    const parsed = JSON.parse(w);
    if (parsed.userId === userId) watches.push(parsed);
  }
  return json({ watches });
}

async function handleDeleteWatch(request, env, watchId) {
  const userId = request.headers.get('x-qualmly-user');
  if (!userId) return json({ error: 'missing x-qualmly-user header' }, 401);

  const w = await env.WATCHES.get(`watch:${watchId}`);
  if (!w) return json({ error: 'not found' }, 404);
  if (JSON.parse(w).userId !== userId) return json({ error: 'forbidden' }, 403);

  await env.WATCHES.delete(`watch:${watchId}`);
  await env.HISTORY.delete(`history:${watchId}:latest`);
  await env.HISTORY.delete(`history:${watchId}:list`);
  return json({ deleted: watchId });
}

async function handleGetResults(request, env, watchId) {
  const userId = request.headers.get('x-qualmly-user');
  if (!userId) return json({ error: 'missing x-qualmly-user header' }, 401);

  const w = await env.WATCHES.get(`watch:${watchId}`);
  if (!w) return json({ error: 'not found' }, 404);
  if (JSON.parse(w).userId !== userId) return json({ error: 'forbidden' }, 403);

  const latest = await env.HISTORY.get(`history:${watchId}:latest`);
  const history = await env.HISTORY.get(`history:${watchId}:list`);
  return json({
    latest: latest ? JSON.parse(latest) : null,
    history: history ? JSON.parse(history) : []
  });
}

async function handleStripeWebhook(request, env) {
  // Verify signature — set STRIPE_WEBHOOK_SECRET in worker secrets.
  // SCAFFOLD: signature verification + event routing pending.
  const sig = request.headers.get('stripe-signature');
  if (!sig) return json({ error: 'missing signature' }, 400);
  // ... verify, then handle checkout.session.completed / customer.subscription.deleted
  return json({ ok: true });
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://qualmly.dev'
    }
  });
}

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
