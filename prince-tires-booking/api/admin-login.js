const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }

  const { password } = b || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const hash   = process.env.ADMIN_PASSWORD_HASH;
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!hash || !secret) return res.status(500).json({ error: 'Server not configured' });

  const ok = await bcrypt.compare(password, hash);
  if (!ok) return res.status(401).json({ error: 'Invalid password' });

  const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '12h' });
  return res.status(200).json({ token });
};
