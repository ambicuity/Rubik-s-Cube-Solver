/**
 * Google Cloud Function Proxy — with structured logging and HMAC verification
 *
 * Deployment (same as before):
 *   gcloud functions deploy gemini-proxy \
 *     --runtime nodejs20 \
 *     --trigger-http \
 *     --allow-unauthenticated \
 *     --set-secrets 'GEMINI_API_KEY=gemini-api-key:latest,HMAC_SECRET=gemini-hmac-secret:latest' \
 *     --set-env-vars 'ALLOWED_ORIGIN=https://ambicuity.github.io'
 */

const functions = require('@google-cloud/functions-framework');
const crypto = require('crypto');

const GEMINI_MODEL = 'gemini-1.5-flash';
const HMAC_WINDOW = 5;   // minutes
const RATE_LIMIT = 15;
const RATE_WINDOW = 3600 * 1000;

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN || 'https://ambicuity.github.io',
  'http://localhost:8000',
  'http://localhost:3000'
];

// ---------------------------------------------------------------------------
// Structured logger — outputs JSON lines compatible with Cloud Logging
// ---------------------------------------------------------------------------
function makeLogger(req) {
  const requestId = crypto.randomUUID();
  return (severity, event, fields = {}) => {
    const entry = {
      severity,         // DEBUG | INFO | WARNING | ERROR
      event,
      requestId,
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
      ...fields
    };
    // Cloud Logging structured log — must go to stdout
    process.stdout.write(JSON.stringify(entry) + '\n');
  };
}

// ---------------------------------------------------------------------------
// HMAC token verification (Node.js crypto)
// ---------------------------------------------------------------------------
function verifyHmacToken(token, secret) {
  if (!token || !secret) return !secret; // no secret = skip check
  const now = Math.floor(Date.now() / (HMAC_WINDOW * 60_000));
  for (const window of [now, now - 1]) {
    const expected = crypto.createHmac('sha256', secret)
      .update(`gemini:${window}`)
      .digest('hex');
    if (timingSafeEqual(token, expected)) return true;
  }
  return false;
}

function timingSafeEqual(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Rate limiter (in-process; upgrade to Cloud Memorystore for multi-instance)
// ---------------------------------------------------------------------------
const requestCounts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = requestCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) { requestCounts.set(ip, { count: 1, start: now }); return true; }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  requestCounts.set(ip, entry);
  return true;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
functions.http('geminiProxy', async (req, res) => {
  const origin = req.headers['origin'] || '';
  const log = makeLogger(req);
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';

  const setCors = () => {
    if (allowOrigin) {
      res.set('Access-Control-Allow-Origin', allowOrigin);
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Request-Token');
      res.set('Vary', 'Origin');
    }
  };

  setCors();

  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  if (!allowOrigin) {
    log('WARNING', 'cors_blocked', { origin });
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // HMAC token verification
  const token = req.headers['x-request-token'];
  if (!verifyHmacToken(token, process.env.HMAC_SECRET)) {
    log('WARNING', 'invalid_hmac_token', { tokenPrefix: token?.slice(0, 8) });
    res.status(401).json({ error: 'Unauthorized: invalid or expired request token' });
    return;
  }

  // Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    log('WARNING', 'rate_limit_exceeded', { ip });
    res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    return;
  }

  const { prompt, maxTokens = 800 } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 4000) {
    log('WARNING', 'invalid_prompt', { promptLength: prompt?.length });
    res.status(400).json({ error: 'Invalid or missing prompt' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log('ERROR', 'missing_api_key', {});
    res.status(500).json({ error: 'API key not configured on proxy' });
    return;
  }

  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 }
      })
    });
  } catch (err) {
    log('ERROR', 'gemini_network_error', { error: err.message });
    res.status(502).json({ error: 'Failed to reach Gemini API' });
    return;
  }

  if (!response.ok) {
    const errText = await response.text();
    log('ERROR', 'gemini_api_error', { status: response.status, body: errText.slice(0, 200) });
    res.status(response.status).json({ error: `Gemini error: ${response.status}` });
    return;
  }

  const data = await response.json();
  const explanation = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
  const durationMs = Date.now() - t0;

  log('INFO', 'request_success', { ip, durationMs, promptLength: prompt.length });

  res.status(200).json({ explanation, success: true });
});
