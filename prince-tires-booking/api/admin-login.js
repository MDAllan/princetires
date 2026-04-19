'use strict';
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
} = require('./_lib/security');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  // A07: strict brute-force protection on login — 5 attempts per 15 minutes per IP
  if (!rateLimit(req, res, 5, 900_000)) return;

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }

  const { password } = b || {};
  if (!password || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'Password required.' });
  }

  const hash   = process.env.ADMIN_PASSWORD_HASH;
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!hash || !secret) {
    console.error('admin-login: ADMIN_PASSWORD_HASH or ADMIN_JWT_SECRET not set');
    return res.status(500).json({ error: 'Server not configured.' });
  }

  const ok = await bcrypt.compare(password, hash);
  if (!ok) {
    // Generic message — do not reveal whether hash exists or not
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '12h' });
  return res.status(200).json({ token });
};
