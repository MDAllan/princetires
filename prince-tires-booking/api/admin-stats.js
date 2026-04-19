const jwt = require('jsonwebtoken');

const SHOP = 'prince-tires-5560.myshopify.com';

async function shopifyToken() {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${process.env.SHOPIFY_CLIENT_ID}&client_secret=${process.env.SHOPIFY_CLIENT_SECRET}`
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`Token endpoint non-JSON (${r.status})`);
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function safeJson(r) {
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  return r.json();
}

function verifyAuth(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) throw new Error('No token');
  return jwt.verify(t, process.env.ADMIN_JWT_SECRET);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();



  try {
    const token = await shopifyToken();
    const base = `https://${SHOP}/admin/api/2024-10`;
    const headers = { 'X-Shopify-Access-Token': token };

    const [custRes, orderRes] = await Promise.all([
      fetch(`${base}/customers/count.json`, { headers }),
      fetch(`${base}/orders/count.json?status=any`, { headers })
    ]);

    const [custData, orderData] = await Promise.all([
      safeJson(custRes),
      safeJson(orderRes)
    ]);

    return res.status(200).json({
      customers: custData?.count ?? 0,
      orders:    orderData?.count ?? 0
    });
  } catch (err) {
    console.error('admin-stats error:', err);
    return res.status(500).json({ error: err.message });
  }
};
