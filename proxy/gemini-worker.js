/**
 * Cloudflare Worker Proxy for Google Gemini API — with HMAC token verification
 * and structured logging.
 *
 * How HMAC signing works:
 *   1. Your frontend generates a time-limited token:
 *        HMAC-SHA256(secret, "gemini:" + Math.floor(Date.now() / 300_000))
 *   2. It sends the token in the X-Request-Token header.
 *   3. The Worker verifies the token before forwarding to Gemini.
 *   4. Tokens expire every 5 minutes (configurable via HMAC_WINDOW_MIN).
 *
 * Worker environment variables (set in Cloudflare dashboard):
 *   GEMINI_API_KEY    — your Gemini API key
 *   ALLOWED_ORIGIN    — e.g. https://ambicuity.github.io
 *   HMAC_SECRET       — random 32-byte hex string (openssl rand -hex 32)
 *
 * KV namespace binding:
 *   RATE_LIMITER      — KV namespace for per-IP rate limiting
 */

const GEMINI_MODEL = 'gemini-1.5-flash';
const RATE_LIMIT = 15;
const RATE_WINDOW = 3600;        // seconds
const HMAC_WINDOW_MIN = 5;           // token validity window in minutes

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const origin = request.headers.get('Origin') || '';
  const log = makeLogger(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    log('warn', 'method_not_allowed', { method: request.method });
    return new Response('Method not allowed', { status: 405 });
  }

  // ------------------------------------------------------------------
  // HMAC token verification
  // ------------------------------------------------------------------
  const token = request.headers.get('X-Request-Token');
  if (HMAC_SECRET) {
    const valid = await verifyHmacToken(token, HMAC_SECRET);
    if (!valid) {
      log('warn', 'invalid_hmac_token', { token: token?.slice(0, 8) });
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid or expired request token' }),
        { status: 401, headers: corsHeaders(origin) }
      );
    }
  }

  // ------------------------------------------------------------------
  // CORS
  // ------------------------------------------------------------------
  const allowed = [
    'https://ambicuity.github.io',
    'http://localhost:8000',
    'http://localhost:3000'
  ];
  if (!allowed.includes(origin)) {
    log('warn', 'cors_blocked', { origin });
    return new Response(JSON.stringify({ error: 'Origin not allowed' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  // ------------------------------------------------------------------
  // Rate limiting
  // ------------------------------------------------------------------
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  try {
    const key = `rate:${ip}`;
    const raw = await RATE_LIMITER.get(key);
    const count = raw ? parseInt(raw) : 0;
    if (count >= RATE_LIMIT) {
      log('warn', 'rate_limit_exceeded', { ip });
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: corsHeaders(origin) }
      );
    }
    await RATE_LIMITER.put(key, count + 1, { expirationTtl: RATE_WINDOW });
  } catch {
    log('warn', 'rate_limiter_kv_unavailable', {});
  }

  // ------------------------------------------------------------------
  // Parse & validate body
  // ------------------------------------------------------------------
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: corsHeaders(origin) });
  }

  const { prompt, maxTokens = 800 } = body;
  if (!prompt || typeof prompt !== 'string' || prompt.length > 4000) {
    log('warn', 'invalid_prompt', { promptLength: prompt?.length });
    return new Response(JSON.stringify({ error: 'Invalid or missing prompt' }),
      { status: 400, headers: corsHeaders(origin) });
  }

  // ------------------------------------------------------------------
  // Call Gemini
  // ------------------------------------------------------------------
  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 }
      })
    });
  } catch (err) {
    log('error', 'gemini_network_error', { error: err.message });
    return new Response(JSON.stringify({ error: 'Failed to reach Gemini API' }),
      { status: 502, headers: corsHeaders(origin) });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    log('error', 'gemini_api_error', { status: geminiRes.status, body: errText.slice(0, 200) });
    return new Response(JSON.stringify({ error: `Gemini error: ${geminiRes.status}` }),
      { status: geminiRes.status, headers: corsHeaders(origin) });
  }

  const data = await geminiRes.json();
  const explanation = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
  const durationMs = Date.now() - t0;

  log('info', 'request_success', { ip, durationMs, promptLength: prompt.length });

  return new Response(JSON.stringify({ explanation, success: true }),
    { status: 200, headers: corsHeaders(origin) });
}

// ---------------------------------------------------------------------------
// HMAC token verification (Web Crypto API — available in Workers)
// ---------------------------------------------------------------------------
async function verifyHmacToken(token, secret) {
  if (!token) return false;
  try {
    const now = Math.floor(Date.now() / (HMAC_WINDOW_MIN * 60_000));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    // Accept current window and the previous window (clock skew tolerance)
    for (const window of [now, now - 1]) {
      const msg = enc.encode(`gemini:${window}`);
      const expected = await crypto.subtle.sign('HMAC', key, msg);
      const expectedHex = [...new Uint8Array(expected)]
        .map(b => b.toString(16).padStart(2, '0')).join('');
      if (timingSafeEqual(token, expectedHex)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------
function makeLogger(request) {
  const requestId = crypto.randomUUID();
  return (level, event, fields) => {
    console.log(JSON.stringify({
      level,
      event,
      requestId,
      timestamp: new Date().toISOString(),
      cf_ray: request.headers.get('CF-Ray') || null,
      ...fields
    }));
  };
}

// ---------------------------------------------------------------------------
// CORS headers — strict allowlist
// ---------------------------------------------------------------------------
function corsHeaders(origin) {
  const allowed = [
    'https://ambicuity.github.io',
    'http://localhost:8000',
    'http://localhost:3000'
  ];
  const allowOrigin = allowed.includes(origin) ? origin : '';
  return {
    'Content-Type': 'application/json',
    ...(allowOrigin ? {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Request-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    } : {})
  };
}
