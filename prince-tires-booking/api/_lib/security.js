'use strict';
/**
 * Shared security utilities for prince-tires-booking API.
 * OWASP Top 10 mitigations: A01 (access control), A03 (injection),
 * A05 (misconfiguration), A07 (auth), A09 (logging).
 *
 * Required env vars:
 *   ADMIN_JWT_SECRET       — JWT signing secret for admin portal
 *   BOOKING_LOOKUP_SECRET  — HMAC secret for booking lookup tokens
 *   ALLOWED_ORIGINS        — comma-separated allowed CORS origins
 */

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

// ── CORS ──────────────────────────────────────────────────────────────────────
// Never use '*'. Lock to known origins via env var.
// Default covers Shopify storefront + myshopify preview domain.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://princetires.ca,https://www.princetires.ca,https://prince-tires-5560.myshopify.com'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function setCorsHeaders(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Security headers ──────────────────────────────────────────────────────────
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');                        // let CSP handle it
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
}

// ── In-memory rate limiter ────────────────────────────────────────────────────
// Per Vercel function instance — good for single-function abuse; not globally
// shared across instances, but still provides meaningful protection.
const RL_STORE = new Map();

// Periodically prune expired entries to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of RL_STORE) {
    if (now > entry.resetAt) RL_STORE.delete(key);
  }
}, 60_000);

/**
 * Returns false (and writes 429) when the caller exceeds the rate limit.
 * Returns true when the request is allowed to proceed.
 *
 * @param {object} req      - Vercel request
 * @param {object} res      - Vercel response
 * @param {number} maxReqs  - max requests per window
 * @param {number} windowMs - window length in milliseconds
 */
function rateLimit(req, res, maxReqs = 20, windowMs = 60_000) {
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

// ── Admin JWT auth ────────────────────────────────────────────────────────────
/**
 * Verifies the Bearer JWT on admin requests.
 * Throws on failure — caller must catch and return 401.
 */
function verifyAdminAuth(req) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim();
  if (!token) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    const err = new Error('Server misconfiguration');
    err.status = 500;
    throw err;
  }
  return jwt.verify(token, secret);
}

// ── HTML escaping (email templates) ──────────────────────────────────────────
/**
 * Escape user-supplied values before embedding in HTML email bodies.
 * Prevents XSS in email clients that render HTML.
 */
function escapeHtml(val) {
  const str = typeof val === 'string' ? val : String(val ?? '');
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

// ── Input sanitization ────────────────────────────────────────────────────────
/**
 * Strip control characters and enforce max length.
 * Use on every user-supplied string field.
 */
function sanitize(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val
    // strip null bytes + non-printable control chars (keep \t, \n, \r)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLen)
    .trim();
}

/**
 * Validate and normalize an email address.
 * Returns null if the format is invalid.
 */
function sanitizeEmail(val) {
  const s = sanitize(val, 254);
  // RFC 5321 simplified check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return null;
  return s.toLowerCase();
}

/**
 * Validate a Shopify customer/resource ID (must be a positive integer string).
 */
function validateId(val) {
  const s = String(val || '').trim();
  if (!/^\d{1,20}$/.test(s)) return null;
  return s;
}

// ── Booking lookup HMAC token ─────────────────────────────────────────────────
/**
 * Generate a booking lookup token for an email address.
 * Token = HMAC-SHA256(email_lowercase, BOOKING_LOOKUP_SECRET).
 *
 * Used to prevent IDOR: callers must prove they know the secret
 * (received at booking time) to look up their appointments.
 */
function generateLookupToken(email) {
  const secret = process.env.BOOKING_LOOKUP_SECRET;
  if (!secret) throw new Error('BOOKING_LOOKUP_SECRET not configured');
  return crypto
    .createHmac('sha256', secret)
    .update(email.toLowerCase().trim())
    .digest('hex');
}

/**
 * Constant-time comparison to prevent timing attacks.
 * Returns true only if the token matches the expected HMAC for this email.
 */
function verifyLookupToken(email, token) {
  if (!token || typeof token !== 'string' || token.length !== 64) return false;
  try {
    const expected = Buffer.from(generateLookupToken(email), 'hex');
    const actual   = Buffer.from(token, 'hex');
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ── Booking cancel HMAC token ─────────────────────────────────────────────────
/**
 * Generate a one-time cancel token for a specific calendar event ID.
 * Token = HMAC-SHA256(eventId, BOOKING_LOOKUP_SECRET + ':cancel').
 * Separate from the lookup token so compromising one doesn't affect the other.
 */
function generateCancelToken(eventId) {
  const secret = process.env.BOOKING_LOOKUP_SECRET;
  if (!secret) throw new Error('BOOKING_LOOKUP_SECRET not configured');
  return crypto
    .createHmac('sha256', secret + ':cancel')
    .update(String(eventId).trim())
    .digest('hex');
}

function verifyCancelToken(eventId, token) {
  if (!token || typeof token !== 'string' || token.length !== 64) return false;
  try {
    const expected = Buffer.from(generateCancelToken(eventId), 'hex');
    const actual   = Buffer.from(token, 'hex');
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

module.exports = {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
  escapeHtml,
  sanitize,
  sanitizeEmail,
  validateId,
  generateLookupToken,
  verifyLookupToken,
  generateCancelToken,
  verifyCancelToken,
};
