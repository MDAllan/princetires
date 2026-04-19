'use strict';
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
} = require('./_lib/security');

const SHOP = 'prince-tires-5560.myshopify.com';

async function shopifyToken() {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=client_credentials&client_id=${process.env.SHOPIFY_CLIENT_ID}&client_secret=${process.env.SHOPIFY_CLIENT_SECRET}`,
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`Token endpoint non-JSON (${r.status})`);
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed');
  return d.access_token;
}

async function safeJson(r) {
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  return r.json();
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // A01: authenticate before doing anything else
  try { verifyAdminAuth(req); } catch {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!rateLimit(req, res, 60, 60_000)) return;

  try {
    const token   = await shopifyToken();
    const base    = `https://${SHOP}/admin/api/2024-10`;
    const headers = { 'X-Shopify-Access-Token': token };

    const [custRes, orderRes] = await Promise.all([
      fetch(`${base}/customers/count.json`, { headers }),
      fetch(`${base}/orders/count.json?status=any`, { headers }),
    ]);

    const [custData, orderData] = await Promise.all([
      safeJson(custRes),
      safeJson(orderRes),
    ]);

    return res.status(200).json({
      customers: custData?.count  ?? 0,
      orders:    orderData?.count ?? 0,
    });
  } catch (err) {
    console.error('admin-stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch stats.' });
  }
};
