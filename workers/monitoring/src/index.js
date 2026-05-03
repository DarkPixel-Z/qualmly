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

      // ── Stripe Checkout Session creation (browser → here → Stripe) ─────────
      if (path === '/api/checkout' && method === 'POST') {
        return handleCheckout(request, env);
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
  // 1. Decrypt the user's Anthropic key (mirrors qualmly.dev AES-GCM design).
  // 2. Fetch the watched URL via the same CORS-proxy chain qualmly.dev uses.
  // 3. POST to Anthropic /v1/messages with the App QA prompt.
  // 4. Parse JSON, store + diff against previous, email if changed.

  // Decrypt the user's Anthropic key
  const userJson = await env.USERS.get(`user:${watch.userId}`);
  if (!userJson) throw new Error(`user not found: ${watch.userId}`);
  const user = JSON.parse(userJson);
  if (!user.passphraseHash || !user.encryptedKey) {
    throw new Error('user has no encrypted Anthropic key');
  }
  // For an automated cron scan we can't ask the user for their passphrase.
  // At registration we wrapped their passphrase with SERVICE_PASSPHRASE_SALT
  // (Worker secret) and stored it at svc:<userId>. Unwrap it now, then use
  // it to decrypt the Anthropic key blob the user encrypted in their browser.
  // Net effect: an attacker needs BOTH a KV breach AND the Worker secret to
  // recover any user's Anthropic key.
  if (!env.SERVICE_PASSPHRASE_SALT) {
    throw new Error('SERVICE_PASSPHRASE_SALT secret missing — set it via `wrangler secret put`');
  }
  const wrappedJson = await env.USERS.get(`svc:${watch.userId}`);
  if (!wrappedJson) {
    throw new Error('service passphrase not configured — user needs to enable continuous monitoring');
  }
  // Backwards-compatible: old records may have stored the passphrase in
  // plaintext under svc:<userId>. If JSON.parse fails, fall through and
  // treat the value as the literal passphrase.
  let servicePassphrase;
  try {
    const wrapped = JSON.parse(wrappedJson);
    servicePassphrase = await decryptKey(wrapped, env.SERVICE_PASSPHRASE_SALT);
  } catch (e) {
    servicePassphrase = wrappedJson;
  }
  const anthropicKey = await decryptKey(user.encryptedKey, servicePassphrase);

  // Fetch the page via allorigins (same as qualmly.dev's main proxy)
  const pageRes = await fetch(
    `https://api.allorigins.win/get?url=${encodeURIComponent(watch.targetUrl)}`,
    { signal: AbortSignal.timeout(15000) }
  );
  let pageHtml = '';
  if (pageRes.ok) {
    const wrapped = await pageRes.json();
    pageHtml = (wrapped.contents || '').slice(0, 80_000); // cap to keep prompt size sane
  }

  // Build the App QA prompt — mirrors qualmly.dev's runCheck prompt
  const builderLabels = {
    lovable: 'Lovable', bolt: 'Bolt.new', v0: 'v0 by Vercel',
    cursor: 'Cursor', copilot: 'GitHub Copilot', 'claude-code': 'Claude Code',
    windsurf: 'Windsurf', replit: 'Replit', webflow: 'Webflow + AI'
  };
  const prompt = `You are a senior QA engineer reviewing a vibe-coded web app (built with ${builderLabels[watch.builder] || watch.builder}).

App URL: ${watch.targetUrl}
App description: ${watch.description || '(none provided)'}
App type: ${watch.appType || 'saas'}
Built with: ${watch.builder || 'unknown'}

Live page HTML (truncated):
${pageHtml || '[crawl failed]'}

Scan for the failure patterns common in AI-generated code:
- Missing Supabase Row-Level Security
- Service-role / admin keys leaked to client JS
- Stripe sk_live_, OpenAI sk-, Anthropic sk-ant- in bundle
- Exposed admin routes / debug endpoints
- CORS=* with credentials, missing CSRF protection
- Stripe webhooks without signature verification

Return ONLY valid JSON matching exactly:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence plain-text summary>",
  "categories": [
    {
      "id": "<navigation|forms|auth|errors|responsive|performance|a11y|data>",
      "name": "<human-readable>",
      "status": "<Pass|Warn|Fail>",
      "issues": [{ "text": "<specific issue>", "severity": "<pass|warn|fail>" }],
      "recommendation": "<1-2 sentence actionable fix>"
    }
  ]
}

Cover all 8 categories.`;

  // Call Anthropic with retry-on-5xx (same logic as qualmly.dev)
  const anthropicData = await callAnthropic(anthropicKey, prompt);
  const reportData = parseClaudeJson((anthropicData.content || []).map(c => c.text || '').join(''));

  // Flatten categories into top-level findings for easier diff
  const flatFindings = [];
  for (const cat of reportData.categories || []) {
    for (const iss of cat.issues || []) {
      flatFindings.push({
        title: (iss.text || '').slice(0, 200),
        category: cat.id,
        severity: (iss.severity || 'info').toLowerCase()
      });
    }
  }

  const newResult = {
    scannedAt: Date.now(),
    score: typeof reportData.score === 'number' ? reportData.score : 0,
    summary: reportData.summary || '',
    categories: reportData.categories || [],
    findings: flatFindings,
    cost: calcAnthropicCost(anthropicData.usage)
  };

  const prevJson = await env.HISTORY.get(`history:${watch.id}:latest`);
  const prev = prevJson ? JSON.parse(prevJson) : null;

  if (shouldNotify(prev, newResult)) {
    await sendDiffEmail(watch, prev, newResult, env);
  }

  await env.HISTORY.put(`history:${watch.id}:latest`, JSON.stringify(newResult));
  const listKey = `history:${watch.id}:list`;
  const listJson = await env.HISTORY.get(listKey);
  const arr = listJson ? JSON.parse(listJson) : [];
  arr.push({ at: newResult.scannedAt, score: newResult.score, count: flatFindings.length });
  if (arr.length > 30) arr.shift();
  await env.HISTORY.put(listKey, JSON.stringify(arr));
}

async function callAnthropic(apiKey, prompt) {
  const RETRY_STATUSES = new Set([500, 502, 503, 504, 529]);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(90_000)
    });
    if (res.ok) return res.json();
    if (!RETRY_STATUSES.has(res.status) || attempt === 1) {
      throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('unreachable');
}

function parseClaudeJson(raw) {
  let clean = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch (e) {}
  // Truncation repair
  const lastBrace = clean.lastIndexOf('},');
  if (lastBrace > 0) {
    clean = clean.slice(0, lastBrace + 1) + ']}';
    try { return JSON.parse(clean); } catch (e) {}
  }
  throw new Error('Failed to parse Claude JSON response');
}

function calcAnthropicCost(usage) {
  if (!usage) return 0;
  const inT = usage.input_tokens || 0;
  const outT = usage.output_tokens || 0;
  // claude-sonnet-4-6 pricing: $3/M input, $15/M output
  return (inT * 3.0 + outT * 15.0) / 1e6;
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
  if (!env.RESEND_API_KEY) {
    console.warn('[monitor] RESEND_API_KEY not set — email skipped for', watch.email);
    return;
  }
  const subject = prev
    ? `Qualmly: ${watch.targetUrl} score is now ${next.score}/100 (was ${prev.score})`
    : `Qualmly: first scan of ${watch.targetUrl} — score ${next.score}/100`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Qualmly Monitor <monitor@qualmly.dev>',
      to: [watch.email],
      reply_to: 'info@darkpixelconsultinginc.co',
      subject,
      html: buildEmailHtml(watch, prev, next)
    })
  });
  if (!res.ok) {
    console.error('[monitor] Resend ' + res.status + ': ' + (await res.text()).slice(0, 200));
  } else {
    console.log('[monitor] emailed', watch.email, 'about', watch.targetUrl);
  }
}

function buildEmailHtml(watch, prev, next) {
  const escape = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const scoreColor = next.score >= 75 ? '#3DFFA0' : next.score >= 50 ? '#FFB800' : '#FF4D6D';
  const dateStr = new Date(next.scannedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Identify NEW critical findings (not in prev)
  const prevTitles = new Set((prev && prev.findings || []).filter(f => f.severity === 'fail').map(f => f.title));
  const newFails = (next.findings || []).filter(f => f.severity === 'fail' && !prevTitles.has(f.title));

  const findingsHtml = newFails.length
    ? newFails.map(f => `<li style="margin:6px 0"><strong style="color:#FF4D6D">●</strong> ${escape(f.title)} <span style="color:#7B7B90;font-size:11px">[${escape(f.category)}]</span></li>`).join('')
    : '<li style="color:#7B7B90;list-style:none">No new critical findings since the last scan.</li>';

  const scoreLine = prev
    ? `Score: <strong>${next.score}/100</strong> (was ${prev.score})`
    : `Score: <strong>${next.score}/100</strong> (first scan)`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Qualmly Monitor</title>
</head>
<body style="margin:0;padding:0;background:#0E0E15;color:#F2F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0E0E15">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#17171F;border:1px solid #2E2E3E;border-radius:14px;overflow:hidden">
        <tr><td style="padding:24px 28px;background:linear-gradient(135deg,#D4FF4F,#EBFF78);color:#0E0E15">
          <div style="font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;opacity:0.75">Qualmly Monitor &middot; ${dateStr}</div>
          <div style="font-size:22px;font-weight:800;margin-top:6px">${escape(watch.targetUrl)}</div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <div style="font-size:14px;color:#7B7B90;margin-bottom:6px">${scoreLine}</div>
          <div style="height:8px;background:#2E2E3E;border-radius:4px;overflow:hidden">
            <div style="width:${Math.max(2, Math.min(100, next.score))}%;height:8px;background:${scoreColor}"></div>
          </div>
          ${prev ? `<div style="font-size:12px;color:#7B7B90;margin-top:10px">${prev.score - next.score >= 10 ? '⚠ Score dropped 10+ points since last scan.' : 'Findings changed since last scan.'}</div>` : ''}
        </td></tr>
        ${next.summary ? `<tr><td style="padding:0 28px 18px;color:#F2F2F5;font-size:14px;line-height:1.55">${escape(next.summary)}</td></tr>` : ''}
        <tr><td style="padding:0 28px 24px">
          <div style="font-size:13px;font-weight:700;color:#F2F2F5;margin-bottom:10px">${newFails.length ? `🔴 New critical findings (${newFails.length})` : '✅ No new criticals'}</div>
          <ul style="margin:0;padding-left:18px;font-size:14px;color:#F2F2F5;line-height:1.5">${findingsHtml}</ul>
        </td></tr>
        <tr><td style="padding:0 28px 28px" align="center">
          <a href="https://qualmly.dev?utm_source=monitor_email&utm_medium=email" style="display:inline-block;padding:11px 22px;background:#D4FF4F;color:#0E0E15;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Open the full report on Qualmly →</a>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px dashed #2E2E3E;font-size:11px;color:#7B7B90;line-height:1.6">
          You're receiving this because you set up continuous monitoring on this URL with Qualmly Monitor (Pro tier). To pause or unsubscribe, reply with "PAUSE" or visit your dashboard.
          <br><br>
          DarkPixel Consulting Inc. &middot; Manitoba, Canada
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Mirror of qualmly.dev's _decryptApiKey
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

// ──────────────────────────────────────────────────────────────────────────────
// HTTP handlers
// ──────────────────────────────────────────────────────────────────────────────

async function handleRegister(request, env) {
  // The browser does the heavy work: PBKDF2 + AES-GCM the Anthropic key with
  // the user's passphrase, then POSTs both pieces here. We:
  //   1. Save the already-encrypted blob into USERS KV
  //   2. Wrap the passphrase with SERVICE_PASSPHRASE_SALT (Worker secret) and
  //      save at svc:<userId>. This dual-key model means a KV breach alone
  //      cannot decrypt the Anthropic key — an attacker would also need the
  //      Worker secret. Conversely, a Worker secret leak alone is useless
  //      without the encrypted KV blob.
  //
  // Backwards compatible with the old { anthropicKey } shape — if the client
  // sends a plaintext key we encrypt server-side. New clients should send
  // anthropicKeyEncrypted (the AES-GCM blob from _encryptApiKey).
  const body = await request.json();
  const { email, anthropicKey, anthropicKeyEncrypted, passphrase } = body;
  if (!email || !passphrase) return json({ error: 'missing fields (email, passphrase)' }, 400);
  if (!anthropicKey && !anthropicKeyEncrypted) {
    return json({ error: 'missing fields (anthropicKey or anthropicKeyEncrypted)' }, 400);
  }
  if (!env.SERVICE_PASSPHRASE_SALT) {
    return json({ error: 'server misconfigured: SERVICE_PASSPHRASE_SALT not set' }, 500);
  }

  // Persist the encrypted Anthropic-key blob. Either we got it pre-encrypted
  // from the browser (preferred) or we encrypt here.
  const encryptedKey = anthropicKeyEncrypted || await encryptKey(anthropicKey, passphrase);
  const userId = crypto.randomUUID();

  await env.USERS.put(`user:${userId}`, JSON.stringify({
    id: userId,
    email,
    encryptedKey,
    createdAt: Date.now(),
    subscriptionActive: false // becomes true on Stripe webhook
  }));

  // Wrap the passphrase with the Worker secret. The cron reads svc:<userId>,
  // unwraps the passphrase, then uses it to decrypt the Anthropic key.
  const wrappedPassphrase = await encryptKey(passphrase, env.SERVICE_PASSPHRASE_SALT);
  await env.USERS.put(`svc:${userId}`, JSON.stringify(wrappedPassphrase));

  return json({ userId });
}

/**
 * /api/checkout — create a Stripe Checkout Session for the Pro tier.
 * Returns { checkoutUrl }. The browser redirects there.
 *
 * Two configurations supported:
 *   1. STRIPE_PAYMENT_LINK env var = a static `https://buy.stripe.com/…` URL.
 *      Returns it verbatim. Simplest setup; no Stripe API call.
 *   2. STRIPE_SECRET_KEY + STRIPE_PRICE_ID env vars present → create a Session
 *      via the Stripe API with success/cancel URLs back to qualmly.dev.
 *
 * Pick whichever you've configured. Payment Link is the launch-day default
 * because it avoids a Stripe SDK dependency in the Worker.
 */
async function handleCheckout(request, env) {
  if (env.STRIPE_PAYMENT_LINK) {
    return json({ checkoutUrl: env.STRIPE_PAYMENT_LINK });
  }
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return json({
      error: 'checkout not configured — set STRIPE_PAYMENT_LINK or STRIPE_SECRET_KEY + STRIPE_PRICE_ID'
    }, 503);
  }

  // Stripe Checkout Session creation via form-encoded API (no SDK needed).
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', env.STRIPE_PRICE_ID);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', 'https://qualmly.dev/?mode=monitor&checkout=success');
  params.set('cancel_url',  'https://qualmly.dev/?mode=monitor&checkout=cancel');
  params.set('allow_promotion_codes', 'true');

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  if (!stripeRes.ok) {
    const t = await stripeRes.text();
    return json({ error: 'stripe checkout creation failed', detail: t.slice(0, 400) }, 502);
  }
  const session = await stripeRes.json();
  return json({ checkoutUrl: session.url });
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
