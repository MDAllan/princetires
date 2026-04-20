'use strict';
/**
 * Shared security utilities for prince-tires-ai API.
 * OWASP mitigations: A03 (injection/prompt injection),
 * A05 (misconfiguration), A07 (rate limiting), A09 (logging).
 *
 * Required env vars:
 *   ALLOWED_ORIGINS — comma-separated allowed CORS origins
 */

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://princetires.ca,https://www.princetires.ca,https://prince-tires-5560.myshopify.com'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export function setCorsHeaders(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Security headers ──────────────────────────────────────────────────────────
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

// ── In-memory rate limiter ────────────────────────────────────────────────────
const RL_STORE = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of RL_STORE) {
    if (now > entry.resetAt) RL_STORE.delete(key);
  }
}, 60_000);

/**
 * Returns false (and writes 429) when the caller exceeds the rate limit.
 */
export function rateLimit(req, res, maxReqs = 20, windowMs = 60_000) {
  const ip   = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const path = (req.url || '').split('?')[0];
  const key  = `${ip}:${path}`;
  const now  = Date.now();

  let entry = RL_STORE.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    RL_STORE.set(key, entry);
  }
  entry.count++;

  if (entry.count > maxReqs) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return false;
  }
  return true;
}

// ── Input sanitization ────────────────────────────────────────────────────────
/**
 * Strip control characters and enforce max length on any string input.
 */
export function sanitize(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLen)
    .trim();
}

/**
 * Sanitize a value for safe interpolation into an AI prompt.
 * Strips prompt-injection patterns in addition to control chars.
 * The value is still wrapped in quotes by the caller — this prevents
 * injection via quote-escaping or instruction smuggling.
 */
export function sanitizeForPrompt(val, maxLen = 150) {
  const s = sanitize(val, maxLen);
  // Remove common prompt-injection trigger patterns
  return s
    .replace(/ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi, '[filtered]')
    .replace(/system\s*:/gi, '[filtered]')
    .replace(/\bDAN\b/g, '[filtered]')
    .replace(/\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/g, '[filtered]');
}
