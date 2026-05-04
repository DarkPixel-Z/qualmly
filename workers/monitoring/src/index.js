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

const QUALMLY_VERSION = 'monitor-v1.4.1';

// Allow both apex and www. Add localhost:8765 for static-server smoke tests.
const ALLOWED_ORIGINS = new Set([
  'https://qualmly.dev',
  'https://www.qualmly.dev',
  'http://localhost:8765',
  'http://127.0.0.1:8765'
]);

function pickOrigin(request) {
  const o = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.has(o) ? o : 'https://qualmly.dev';
}

export default {
  async fetch(request, env, ctx) {
    const origin = pickOrigin(request);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight. Allow both apex and www on qualmly.dev. Echo back the
    // matched origin so credentialed requests work; fall back to apex if the
    // request didn't include an Origin header (e.g. cURL).
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          // x-qualmly-user is the per-request bearer for watch CRUD; without
          // it preflight blocks every dashboard call. Stripe-Signature is
          // listed for completeness even though Stripe sets it server-side.
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-qualmly-user, Stripe-Signature',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin'
        }
      });
    }

    try {
      const response = await this._route(request, env, ctx, path, method);
      return withCors(response, origin);
    } catch (err) {
      console.error('[monitor]', err && err.stack);
      return withCors(json({ error: err && err.message ? err.message : String(err) }, 500), origin);
    }
  },

  // Inner routing — extracted so the top-level fetch can wrap every response
  // in CORS headers without duplicating the dispatch table.
  async _route(request, env, ctx, path, method) {
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

    // ── Webhook: Stripe subscription lifecycle ─────────────────────────────
    if (path === '/webhooks/stripe' && method === 'POST') {
      return handleStripeWebhook(request, env);
    }

    return json({ error: 'not found', path }, 404);
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
  // KV.list() pages at 1000 keys; we MUST follow the cursor or watches past
  // the first page silently never scan.
  const due = [];
  let cursor;
  do {
    const page = await env.WATCHES.list({ prefix: 'watch:', cursor, limit: 1000 });
    cursor = page.list_complete ? undefined : page.cursor;
    // Filter out the user_watches:<userId> index entries (those keys also
    // start with "user_" not "watch:" so the prefix already excludes them,
    // but be defensive in case the prefix is ever generalized).
    for (const key of page.keys) {
      if (!key.name.startsWith('watch:')) continue;
      due.push(key.name);
    }
  } while (cursor);

  const now = Date.now();
  let scanned = 0;
  let skipped = 0;
  let failed = 0;

  // Cap work per cron run to avoid wall-clock timeout. With weekly scans + the
  // hourly cron cadence we'll catch up within a few hours of any backlog.
  const MAX_PER_CRON = 50;

  // Sort by lastScanAt ascending (most-overdue first) so a partial run is fair.
  const candidates = [];
  for (const keyName of due) {
    const watchJson = await env.WATCHES.get(keyName);
    if (!watchJson) continue;
    let watch; try { watch = JSON.parse(watchJson); } catch (e) { continue; }
    candidates.push({ keyName, watch });
  }
  candidates.sort((a, b) => (a.watch.lastScanAt || 0) - (b.watch.lastScanAt || 0));

  // Concurrency limiter — Cloudflare Workers run async I/O concurrently in a
  // single isolate, so a small concurrency window cuts wall-clock time
  // significantly without breaking anything.
  const CONCURRENCY = 5;
  let i = 0;
  while (i < candidates.length && scanned + failed < MAX_PER_CRON) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    i += CONCURRENCY;
    const results = await Promise.allSettled(batch.map(({ keyName, watch }) =>
      _scanOneWatch(keyName, watch, now, env)
    ));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'scanned') scanned++;
        else if (r.value === 'skipped') skipped++;
        else if (r.value === 'failed') failed++;
      } else {
        failed++;
        console.error('[monitor] _scanOneWatch threw', r.reason && r.reason.message);
      }
    }
    if (scanned + failed >= MAX_PER_CRON) {
      console.warn('[monitor] cron hit MAX_PER_CRON cap', MAX_PER_CRON, '— remaining will scan next hour');
      break;
    }
  }

  console.log(`[monitor] scheduled run: scanned=${scanned} skipped=${skipped} failed=${failed} total=${due.length}`);
}

// One-watch wrapper: applies due/paused/subscription gates, runs the scan,
// updates lastScanAt + consecutiveFailures, and (on too many failures)
// auto-pauses the watch and emails the user.
//
// Returns one of: 'scanned' | 'skipped' | 'failed'.
//
// Crucial: lastScanAt is updated on BOTH success and failure. Earlier the
// failure path skipped the update, which made every cron scan retry the same
// failing watch every hour forever, burning user Anthropic credits.
async function _scanOneWatch(keyName, watch, now, env) {
  // Re-read user every scan so cancellation takes effect immediately
  // (subscriptionActive is the canonical source — we deliberately do NOT
  // denormalize it onto the watch).
  const userJson = await env.USERS.get(`user:${watch.userId}`);
  if (!userJson) return 'skipped';
  let user; try { user = JSON.parse(userJson); } catch(e) { return 'skipped'; }
  // v1.4 LAUNCH: subscriptionActive gate disabled (honor-system mode).
  // See handleAddWatch for full rationale. Re-enable in v1.4.1.
  // if (!user.subscriptionActive) return 'skipped';

  const intervalMs = (watch.intervalDays || 7) * 24 * 60 * 60 * 1000;
  const dueAt = (watch.lastScanAt || 0) + intervalMs;
  if (now < dueAt) return 'skipped';
  if (watch.paused) return 'skipped';

  let outcome = 'scanned';
  let scanErr = null;
  try {
    await runScanForWatch(watch, env);
    watch.consecutiveFailures = 0;
    watch.lastError = null;
  } catch (err) {
    outcome = 'failed';
    scanErr = err;
    watch.consecutiveFailures = (watch.consecutiveFailures || 0) + 1;
    watch.lastError = (err && err.message ? err.message : String(err)).slice(0, 500);
    console.error('[monitor] scan failed for', watch.id, watch.lastError);
    // Auto-pause + notify the user after 5 consecutive failures (typically a
    // revoked Anthropic key or an Anthropic-side outage that's gone on too long).
    if (watch.consecutiveFailures >= 5 && !watch.paused) {
      watch.paused = true;
      try { await sendPausedEmail(watch, watch.lastError, env); }
      catch (e) { console.error('[monitor] sendPausedEmail failed', e && e.message); }
    }
  } finally {
    // ALWAYS advance lastScanAt — even on failure — to prevent retry storms.
    watch.lastScanAt = now;
    try {
      await env.WATCHES.put(keyName, JSON.stringify(watch));
    } catch (e) {
      console.error('[monitor] WATCHES.put failed for', watch.id, e && e.message);
    }
  }
  return outcome;
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

  // Send the email FIRST. If we persist `latest` and THEN the email fails,
  // the next cron run sees the new result as `prev` and the user is never
  // told about the changes that triggered this notification — we'd silently
  // swallow exactly the alert they're paying for.
  let emailDelivered = true;
  if (shouldNotify(prev, newResult)) {
    emailDelivered = await sendDiffEmail(watch, prev, newResult, env);
  }

  // Only persist the new latest if either no email was needed OR the email
  // succeeded. On Resend failure, leave `latest` unchanged so next cron will
  // retry the diff-and-notify flow against the same `prev`.
  if (emailDelivered) {
    await env.HISTORY.put(`history:${watch.id}:latest`, JSON.stringify(newResult));
    const listKey = `history:${watch.id}:list`;
    const listJson = await env.HISTORY.get(listKey);
    const arr = listJson ? JSON.parse(listJson) : [];
    arr.push({ at: newResult.scannedAt, score: newResult.score, count: flatFindings.length });
    if (arr.length > 30) arr.shift();
    await env.HISTORY.put(listKey, JSON.stringify(arr));
  } else {
    console.warn('[monitor] email failed — not advancing latest; will retry next cron');
  }
}

async function callAnthropic(apiKey, prompt) {
  const RETRY_STATUSES = new Set([500, 502, 503, 504, 529]);
  const MAX_ATTEMPTS = 3;
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
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
      if (res.ok) return await res.json();
      const bodyText = (await res.text()).slice(0, 400);
      // Don't retry 4xx (auth, billing, validation) — those won't recover
      // and we'd be wasting the user's Anthropic credits.
      if (!RETRY_STATUSES.has(res.status)) {
        throw new Error(`Anthropic API ${res.status}: ${bodyText}`);
      }
      lastErr = new Error(`Anthropic API ${res.status}: ${bodyText}`);
    } catch (e) {
      // Network errors / AbortError — retry these.
      if (e && e.name === 'AbortError') {
        lastErr = new Error('Anthropic API timeout (90s)');
      } else if (lastErr === null || e.message !== lastErr.message) {
        lastErr = e;
      }
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      // Exponential backoff: 1.5s, 4.5s, 13.5s. Reduces the chance that a
      // brief Anthropic incident skips ALL of a user's scans for the hour.
      const delay = 1500 * Math.pow(3, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr || new Error('Anthropic API: all retries failed');
}

// Hardened: never throws. If we can't parse Claude's response, we return a
// minimal "scan failed" object so the cron continues, the user sees a
// dashboard entry, and the email path can decide whether to notify.
function parseClaudeJson(raw) {
  if (!raw || typeof raw !== 'string') {
    return { score: 0, summary: 'Empty response from model.', categories: [] };
  }
  // Strip markdown fences if present.
  let clean = raw.replace(/```json|```/g, '').trim();

  // Slice from first { to last } — handles preamble/postamble like
  // "Here is the JSON: { ... } Hope this helps!"
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }

  try { return JSON.parse(clean); } catch (e) {}

  // Truncation repair: walk back to find a `},` that, when followed by `]}`,
  // forms valid JSON.
  for (let cut = clean.lastIndexOf('},'); cut > 0; cut = clean.lastIndexOf('},', cut - 1)) {
    const candidate = clean.slice(0, cut + 1) + ']}';
    try { return JSON.parse(candidate); } catch (e) {}
    if (cut < 100) break; // give up if we've walked back too far
  }

  // Last resort: return a minimal valid shape with the raw text in summary so
  // the dashboard surfaces what happened. Log a hash, NEVER the content (the
  // raw text could include the page HTML and indirectly contain user secrets).
  console.warn('[monitor] parseClaudeJson failed; raw length =', raw.length);
  return {
    score: 0,
    summary: 'Could not parse the model response for this scan. The next scheduled scan will retry.',
    categories: []
  };
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
    // Email is intentionally not configured (e.g. early launch where the
    // operator is reading scan results manually via the dashboard). Treat
    // as "delivered" so runScanForWatch advances the `latest` pointer —
    // otherwise we'd re-scan the same target every cron tick and burn the
    // user's Anthropic credit on duplicate work.
    console.warn('[monitor] RESEND_API_KEY not set — email skipped for', watch.email);
    return true;
  }
  // Strip CRLF from targetUrl before interpolating into the subject — guards
  // against header-injection if the URL ever contains \r\n.
  const safeUrl = String(watch.targetUrl || '').replace(/[\r\n]/g, '');
  const subject = prev
    ? `Qualmly: ${safeUrl} score is now ${next.score}/100 (was ${prev.score})`
    : `Qualmly: first scan of ${safeUrl} — score ${next.score}/100`;
  try {
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
      const t = await res.text();
      console.error('[monitor] Resend ' + res.status + ': ' + t.slice(0, 200));
      return false;
    }
    console.log('[monitor] emailed', watch.email, 'about', safeUrl);
    return true;
  } catch (e) {
    console.error('[monitor] Resend network error:', e && e.message);
    return false;
  }
}

// Email sent when a watch hits 5 consecutive failures and gets auto-paused.
// Different subject line, different body — we want this to NOT look like the
// regular diff alert.
async function sendPausedEmail(watch, errorMsg, env) {
  if (!env.RESEND_API_KEY) {
    // Same rationale as sendDiffEmail above — treat unconfigured as
    // success so the pause-state still records correctly in KV.
    console.warn('[monitor] RESEND_API_KEY not set — paused email skipped');
    return true;
  }
  const safeUrl = String(watch.targetUrl || '').replace(/[\r\n]/g, '');
  const escape = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0E0E15;color:#F2F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0E0E15"><tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#17171F;border:1px solid #2E2E3E;border-radius:14px;overflow:hidden">
        <tr><td style="padding:24px 28px;background:#FF4D6D;color:#fff">
          <div style="font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;opacity:0.85">Qualmly Monitor — Watch paused</div>
          <div style="font-size:22px;font-weight:800;margin-top:6px">${escape(safeUrl)}</div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:14px;line-height:1.55">
          We've paused this watch because it failed <strong>5 scans in a row</strong>. The most recent error was:
          <pre style="background:#0E0E15;border:1px solid #2E2E3E;border-radius:8px;padding:12px;overflow-x:auto;font-family:monospace;font-size:12px;color:#FF8FA0;margin-top:14px">${escape(errorMsg || '(no detail)')}</pre>
          <p style="margin-top:14px">Most often this means your Anthropic API key was rotated or has run out of credits. Sign in to qualmly.dev → Monitor and re-enter your key to resume.</p>
        </td></tr>
        <tr><td style="padding:0 28px 28px" align="center">
          <a href="https://qualmly.dev?mode=monitor&utm_source=monitor_paused" style="display:inline-block;padding:11px 22px;background:#D4FF4F;color:#0E0E15;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Resume monitoring →</a>
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
  try {
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
        subject: `Qualmly: monitoring paused for ${safeUrl}`,
        html
      })
    });
    return res.ok;
  } catch (e) {
    console.error('[monitor] sendPausedEmail network error:', e && e.message);
    return false;
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

// Mirror of qualmly.dev's _decryptApiKey.
//
// On the 100k iteration count: Cloudflare Workers' Web Crypto API hard-caps
// PBKDF2 at 100,000 iterations regardless of plan. Browser-side qualmly.dev
// must match (otherwise round-trip decrypt fails), so both sides use 100k.
// Still meets NIST 800-132 minimum + OWASP 2023 baseline. Slight reduction
// in offline-brute-force resistance vs the OWASP 2023 "preferred" 600k value
// (~6× more attempts/sec for an attacker with the encrypted blob), but the
// salt is 16 random bytes and the key is wrapped a second time by
// SERVICE_PASSPHRASE_SALT, so the practical impact is negligible.
//
// DESIGN DECISION (v1.4 launch, 2026-05-04): a planned "Option 2" refactor
// would have moved PBKDF2 to the browser at registration time and stored
// only the derived AES-GCM key on the worker side, eliminating any
// per-scan PBKDF2 work in the cron. Deliberately deferred — the 100k
// iteration count is fast enough on V8 isolates (~80-160ms per scan) that
// the refactor would save no user-perceptible time, while adding code
// complexity and a more complex threat model (derived key in transit/at
// rest). Reopen only if production logs show CPU-limit errors.
async function decryptKey(blob, passphrase) {
  const salt = new Uint8Array(blob.salt);
  const iv = new Uint8Array(blob.iv);
  const ct = new Uint8Array(blob.ct);
  const enc = new TextEncoder();
  const pwKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
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

  // Validate email shape + length. Resend rejects malformed emails on send;
  // we'd rather fail at registration than silently never email the user.
  const emailNorm = String(email).trim().toLowerCase();
  if (emailNorm.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return json({ error: 'invalid email' }, 400);
  }
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 200) {
    return json({ error: 'passphrase must be 12-200 chars' }, 400);
  }

  // Persist the encrypted Anthropic-key blob. Either we got it pre-encrypted
  // from the browser (preferred) or we encrypt here.
  const encryptedKey = anthropicKeyEncrypted || await encryptKey(anthropicKey, passphrase);
  const userId = crypto.randomUUID();

  // Index email → userId so when Stripe Checkout completes and the webhook
  // delivers checkout.session.completed, we can link the customer back to
  // this user record. (Also avoids duplicate user records for a returning
  // customer who restarts the flow.)
  await env.USERS.put(`email:${emailNorm}`, userId);

  await env.USERS.put(`user:${userId}`, JSON.stringify({
    id: userId,
    email: emailNorm,
    encryptedKey,
    createdAt: Date.now(),
    subscriptionActive: false, // becomes true on Stripe webhook
    stripeCustomerId: null,
    stripeSubscriptionId: null
  }));

  // Wrap the passphrase with the Worker secret. The cron reads svc:<userId>,
  // unwraps the passphrase, then uses it to decrypt the Anthropic key.
  const wrappedPassphrase = await encryptKey(passphrase, env.SERVICE_PASSPHRASE_SALT);
  await env.USERS.put(`svc:${userId}`, JSON.stringify(wrappedPassphrase));

  return json({ userId });
}

/**
 * /api/checkout — return the URL to redirect the user to for payment.
 * Returns { checkoutUrl }. The browser redirects there.
 *
 * Three configurations supported (checked in priority order):
 *   1. CHECKOUT_URL env var = any static URL (Stripe Payment Link, Gumroad
 *      subscription product link, etc.). Returns verbatim with optional
 *      tracking params appended. Simplest setup; works with any provider.
 *      (Falls back to STRIPE_PAYMENT_LINK for backwards compat.)
 *   2. STRIPE_SECRET_KEY + STRIPE_PRICE_ID env vars present → create a
 *      Stripe Checkout Session via the Stripe API.
 *   3. None set → return 503 with a clear error.
 *
 * v1.4 launch uses (1) pointing at a Gumroad subscription product —
 * removes Stripe-account dependency for day-one ship.
 */
async function handleCheckout(request, env) {
  // The browser may pass { email, userId } in the body. We use these to:
  //   - Pre-fill the checkout email field (better UX)
  //   - Set client_reference_id so the webhook can resolve back to a user.
  let body = {};
  try { body = await request.json(); } catch(e) { body = {}; }
  const userId = typeof body.userId === 'string' ? body.userId.slice(0, 100) : '';
  const email  = typeof body.email  === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';

  // Generic checkout URL (Stripe Payment Link, Gumroad, or anything else that
  // accepts URL parameters for prefill/tracking). STRIPE_PAYMENT_LINK is the
  // backwards-compat alias from v1.4 pre-launch.
  const checkoutBase = env.CHECKOUT_URL || env.STRIPE_PAYMENT_LINK;
  if (checkoutBase) {
    let url = checkoutBase;
    const sep = url.includes('?') ? '&' : '?';
    const extras = [];
    // client_reference_id is the Stripe naming, but Gumroad ignores unknown
    // params harmlessly so this works for both.
    if (userId) extras.push('client_reference_id=' + encodeURIComponent(userId));
    if (email)  extras.push('prefilled_email='     + encodeURIComponent(email));
    if (extras.length) url = url + sep + extras.join('&');
    return json({ checkoutUrl: url });
  }
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return json({
      error: 'checkout not configured — set CHECKOUT_URL (Gumroad/Stripe Payment Link) or STRIPE_SECRET_KEY + STRIPE_PRICE_ID'
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
  if (userId) {
    params.set('client_reference_id', userId);
    // Also persist on the subscription metadata so subsequent
    // customer.subscription.{updated,deleted} events can resolve back
    // to the user without re-querying the checkout session.
    params.set('subscription_data[metadata][qualmly_user_id]', userId);
  }
  if (email) params.set('customer_email', email);

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

  // Validate targetUrl — defense in depth against SSRF. The cron later
  // fetches this URL via allorigins (which is itself an isolation layer),
  // but if a future change ever fetches it directly, we need bullet-proof
  // input validation now.
  const urlCheck = validatePublicUrl(targetUrl);
  if (!urlCheck.ok) return json({ error: 'targetUrl invalid: ' + urlCheck.reason }, 400);

  // Clamp intervalDays to a sane range. A user posting `0.0001` would make
  // the watch "due" every cron forever; `-1` would make `dueAt` always in
  // the past.
  let safeInterval = parseInt(intervalDays, 10);
  if (!Number.isFinite(safeInterval) || safeInterval < 1)   safeInterval = 7;
  if (safeInterval > 365) safeInterval = 365;

  const safeBuilder = (typeof builder === 'string' ? builder : 'lovable').slice(0, 30);
  const safeAppType = (typeof appType === 'string' ? appType : 'saas').slice(0, 30);
  const safeDescription = (typeof description === 'string' ? description : '').slice(0, 500);

  const userJson = await env.USERS.get(`user:${userId}`);
  if (!userJson) return json({ error: 'user not found' }, 404);
  const user = JSON.parse(userJson);
  // v1.4 LAUNCH: subscriptionActive enforcement is honor-system (Amanda manually
  // onboards via private flow, BYOK means scan cost is on the user's Anthropic
  // credit not ours). Re-enable in v1.4.1 once Gumroad webhook handler is wired
  // to flip subscriptionActive automatically on purchase.
  // if (!user.subscriptionActive) return json({ error: 'subscription not active' }, 402);

  // Per-user watch index. Both the watch record and the user's index list
  // are written. The list lets handleListWatches do O(1) lookup per user
  // instead of scanning the entire WATCHES namespace.
  const watchId = crypto.randomUUID();
  const watch = {
    id: watchId,
    userId,
    email: user.email,
    targetUrl: urlCheck.normalized,
    intervalDays: safeInterval,
    builder: safeBuilder,
    appType: safeAppType,
    description: safeDescription,
    createdAt: Date.now(),
    lastScanAt: 0,
    paused: false,
    consecutiveFailures: 0
    // NOTE: subscriptionActive is intentionally NOT denormalized here —
    // canonical source is user.subscriptionActive, looked up at scan time.
  };

  await env.WATCHES.put(`watch:${watchId}`, JSON.stringify(watch));

  // Update the per-user watch index.
  const indexKey = `user_watches:${userId}`;
  const existing = await env.WATCHES.get(indexKey);
  let watchIds = [];
  try { watchIds = existing ? JSON.parse(existing) : []; } catch(e) { watchIds = []; }
  if (!watchIds.includes(watchId)) watchIds.push(watchId);
  await env.WATCHES.put(indexKey, JSON.stringify(watchIds));

  return json({ watchId });
}

/**
 * Reject anything that isn't a public http(s) URL. Blocks SSRF vectors:
 * private IP ranges, link-local, loopback, file://, ftp://, javascript: etc.
 *
 * Returns { ok: true, normalized } or { ok: false, reason }.
 *
 * NOTE: this is a string-based pre-flight. The cron also fetches via
 * allorigins which adds a second isolation layer. If you ever switch to
 * direct fetch, add a DNS-resolution check here too — a public hostname
 * could resolve to a private IP (DNS rebinding).
 */
function validatePublicUrl(input) {
  if (typeof input !== 'string' || input.length === 0) return { ok: false, reason: 'empty or non-string' };
  if (input.length > 2048) return { ok: false, reason: 'too long (>2048 chars)' };
  let parsed;
  try { parsed = new URL(input); } catch (e) { return { ok: false, reason: 'malformed URL' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'only http(s) URLs are allowed' };
  }
  const host = parsed.hostname.toLowerCase();
  // Reject localhost and IP literals in private/link-local ranges.
  if (host === 'localhost' || host.endsWith('.localhost')) return { ok: false, reason: 'localhost is not allowed' };
  if (host === '0.0.0.0') return { ok: false, reason: 'meta-address not allowed' };
  // IPv4 literal in dotted form
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [_, a, b, c, d] = v4.map(Number);
    if (a === 10) return { ok: false, reason: 'private IP range 10.0.0.0/8' };
    if (a === 127) return { ok: false, reason: 'loopback range 127.0.0.0/8' };
    if (a === 169 && b === 254) return { ok: false, reason: 'link-local 169.254.0.0/16 (cloud metadata)' };
    if (a === 172 && b >= 16 && b <= 31) return { ok: false, reason: 'private IP range 172.16.0.0/12' };
    if (a === 192 && b === 168) return { ok: false, reason: 'private IP range 192.168.0.0/16' };
    if (a === 100 && b >= 64 && b <= 127) return { ok: false, reason: 'CGNAT 100.64.0.0/10' };
    if (a === 0 || a >= 224) return { ok: false, reason: 'reserved IPv4 range' };
  }
  // IPv6 literal forms (URL.hostname strips brackets)
  if (host === '::1' || host.startsWith('::1')) return { ok: false, reason: 'IPv6 loopback' };
  if (host.startsWith('fe80:') || host.startsWith('fc00:') || host.startsWith('fd00:')) return { ok: false, reason: 'IPv6 link-local / private' };
  return { ok: true, normalized: parsed.toString() };
}

async function handleListWatches(request, env) {
  const userId = request.headers.get('x-qualmly-user');
  if (!userId) return json({ error: 'missing x-qualmly-user header' }, 401);

  // Read the per-user watch ID list (built in handleAddWatch / handleDeleteWatch),
  // then fetch each watch by direct key. O(W_user) reads instead of O(W_total).
  const indexKey = `user_watches:${userId}`;
  const indexJson = await env.WATCHES.get(indexKey);
  let watchIds = [];
  try { watchIds = indexJson ? JSON.parse(indexJson) : []; } catch(e) { watchIds = []; }

  const watches = [];
  for (const id of watchIds) {
    const w = await env.WATCHES.get(`watch:${id}`);
    if (!w) continue;
    let parsed; try { parsed = JSON.parse(w); } catch(e) { continue; }
    // Defensive: if a stale ID is in the index but the record was deleted,
    // skip it. We don't compact here; handleDeleteWatch is responsible.
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

  // Compact the per-user watch index. Best-effort — if this fails the next
  // list-watches call will silently skip the missing record anyway.
  try {
    const indexKey = `user_watches:${userId}`;
    const indexJson = await env.WATCHES.get(indexKey);
    let watchIds = [];
    try { watchIds = indexJson ? JSON.parse(indexJson) : []; } catch(e) {}
    const filtered = watchIds.filter(id => id !== watchId);
    if (filtered.length !== watchIds.length) {
      await env.WATCHES.put(indexKey, JSON.stringify(filtered));
    }
  } catch (e) { console.error('[monitor] index compact failed', e && e.message); }

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

/**
 * Real Stripe webhook handler. Three responsibilities:
 *
 *  1. Verify the Stripe-Signature header against the raw body using
 *     STRIPE_WEBHOOK_SECRET (timing-safe HMAC-SHA256).
 *  2. Idempotency: if we've seen this event.id before, return 200 without
 *     re-processing (Stripe retries on transient failures).
 *  3. Route the supported events:
 *       checkout.session.completed       → flip user.subscriptionActive=true
 *       customer.subscription.updated    → mirror status (active/past_due/canceled)
 *       customer.subscription.deleted    → flip subscriptionActive=false
 *       invoice.payment_failed           → mark user.paymentFailing=true
 *
 * On signature failure we return 400; on internal failure we return 500 so
 * Stripe retries. On unsupported event type we return 200 (silent ack — Stripe
 * sends every webhook regardless of subscription).
 */
async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, 500);
  }
  const sig = request.headers.get('stripe-signature');
  if (!sig) return json({ error: 'missing stripe-signature header' }, 400);

  // Read RAW body for signature verification — must NOT JSON-parse first.
  const rawBody = await request.text();

  const verified = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    console.warn('[monitor] stripe webhook signature verification failed');
    return json({ error: 'invalid signature' }, 400);
  }

  let event;
  try { event = JSON.parse(rawBody); } catch (e) { return json({ error: 'malformed JSON' }, 400); }
  if (!event || typeof event.type !== 'string' || typeof event.id !== 'string') {
    return json({ error: 'malformed event' }, 400);
  }

  // Idempotency: 7-day TTL keyed on event.id. If already seen, ack and skip.
  const seenKey = `stripe_event:${event.id}`;
  if (await env.USERS.get(seenKey)) {
    return json({ ok: true, replay: true });
  }
  // Mark seen BEFORE processing — at-most-once. If processing fails, we'll
  // get the event ID logged but the user record won't update. Trade-off:
  // double-process is worse than rare manual recovery (and Stripe Dashboard
  // can replay deliberately if needed).
  await env.USERS.put(seenKey, '1', { expirationTtl: 7 * 24 * 3600 });

  const obj = (event.data && event.data.object) || {};
  console.log('[monitor] stripe webhook', event.type, event.id);

  try {
    if (event.type === 'checkout.session.completed') {
      // Resolve the user via client_reference_id, falling back to customer_email.
      const userId = obj.client_reference_id ||
                     await _userIdByEmail(env, obj.customer_email || (obj.customer_details && obj.customer_details.email));
      if (!userId) {
        console.warn('[monitor] checkout.session.completed: cannot resolve user', event.id);
        return json({ ok: true, warning: 'user not resolved' });
      }
      await _updateUser(env, userId, u => {
        u.subscriptionActive = true;
        u.stripeCustomerId = obj.customer || u.stripeCustomerId;
        u.stripeSubscriptionId = obj.subscription || u.stripeSubscriptionId;
        u.paymentFailing = false;
        u.subscribedAt = u.subscribedAt || Date.now();
        return u;
      });
      return json({ ok: true, handled: 'checkout.session.completed', userId });
    }

    if (event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted') {
      const isActive = event.type !== 'customer.subscription.deleted' &&
                       (obj.status === 'active' || obj.status === 'trialing');
      const userId = (obj.metadata && obj.metadata.qualmly_user_id) ||
                     await _userIdByStripeCustomer(env, obj.customer);
      if (!userId) {
        console.warn('[monitor] subscription event: cannot resolve user', event.id, obj.customer);
        return json({ ok: true, warning: 'user not resolved' });
      }
      await _updateUser(env, userId, u => {
        u.subscriptionActive = isActive;
        u.stripeSubscriptionId = obj.id || u.stripeSubscriptionId;
        u.subscriptionStatus = obj.status || null;
        return u;
      });
      return json({ ok: true, handled: event.type, userId, active: isActive });
    }

    if (event.type === 'invoice.payment_failed') {
      const userId = await _userIdByStripeCustomer(env, obj.customer);
      if (!userId) return json({ ok: true, warning: 'user not resolved' });
      await _updateUser(env, userId, u => { u.paymentFailing = true; return u; });
      return json({ ok: true, handled: 'invoice.payment_failed', userId });
    }

    // All other event types — silent ack so Stripe stops retrying.
    return json({ ok: true, ignored: event.type });
  } catch (err) {
    console.error('[monitor] stripe webhook handler failed', event.type, err && err.stack);
    // Returning 500 makes Stripe retry. Since we already wrote the seen-key,
    // the retry will see it and short-circuit. So we DELETE the seen-key on
    // failure to allow Stripe's retry to actually run.
    try { await env.USERS.delete(seenKey); } catch(e) {}
    return json({ error: 'handler failed' }, 500);
  }
}

// Verify Stripe webhook signature. Header looks like:
//   t=1234567890,v1=hex_hmac_sha256,v1=alt
// We parse out `t` and the v1 entries, recompute HMAC-SHA256(`${t}.${rawBody}`)
// using STRIPE_WEBHOOK_SECRET, and timing-safe-compare against any v1.
// Optional 5-minute tolerance prevents replay of long-stored events.
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
  // Replay protection (5 min default). Stripe recommends this.
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tNum) > toleranceSec) {
    console.warn('[monitor] stripe webhook outside tolerance window', { nowSec, tNum });
    return false;
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedPayload = `${t}.${rawBody}`;
  const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
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

// Read-modify-write a user record. Best-effort serialization — KV is
// eventually consistent and there's no atomic CAS, but each Stripe event
// arrives one-at-a-time per session so the race window is small.
async function _updateUser(env, userId, mutator) {
  const userJson = await env.USERS.get(`user:${userId}`);
  if (!userJson) {
    console.warn('[monitor] _updateUser: no user record for', userId);
    return false;
  }
  let user; try { user = JSON.parse(userJson); } catch(e) { return false; }
  const updated = mutator(user) || user;
  await env.USERS.put(`user:${userId}`, JSON.stringify(updated));
  // Maintain stripeCustomer→userId index for lookup on subsequent events.
  if (updated.stripeCustomerId) {
    await env.USERS.put(`stripe_customer:${updated.stripeCustomerId}`, userId);
  }
  return true;
}

async function _userIdByEmail(env, email) {
  if (!email || typeof email !== 'string') return null;
  return await env.USERS.get(`email:${email.trim().toLowerCase()}`);
}

async function _userIdByStripeCustomer(env, stripeCustomerId) {
  if (!stripeCustomerId) return null;
  return await env.USERS.get(`stripe_customer:${stripeCustomerId}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function json(obj, status = 200) {
  // CORS headers are NOT set here — the top-level fetch handler wraps every
  // response via withCors() so the Allow-Origin reflects the actual request
  // Origin (echoed from the ALLOWED_ORIGINS allow-list). Module-level state
  // for "current origin" would race under Workers' request interleaving.
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Clone a Response with CORS headers added. Used to wrap every response from
// the routing layer so concurrent requests from different origins each see
// their own correct Allow-Origin.
function withCors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

async function encryptKey(plaintext, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pwKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
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
