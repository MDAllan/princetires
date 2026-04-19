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
  if (!ct.includes('application/json')) {
    const text = await r.text();
    throw new Error(`Shopify token endpoint returned non-JSON (${r.status}): ${text.substring(0, 200)}`);
  }
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function shopifyGet(token, path) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-10/${path}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await r.text();
    throw new Error(`Shopify API returned non-JSON (${r.status}) for ${path}: ${text.substring(0, 150)}`);
  }
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

    const [pendingData, approvedData] = await Promise.all([
      shopifyGet(token, 'customers/search.json?query=tag:wholesale-pending&limit=250&fields=id,first_name,last_name,email,phone,tags,note,created_at,orders_count,state'),
      shopifyGet(token, 'customers/search.json?query=tag:wholesale&limit=250&fields=id,first_name,last_name,email,phone,tags,note,created_at,orders_count,state')
    ]);

    const approved = approvedData.customers || [];
    const approvedWithMeta = await Promise.all(approved.map(async (c) => {
      try {
        const mf = await shopifyGet(token, `customers/${c.id}/metafields.json`);
        const metafields = (mf.metafields || []).reduce((acc, m) => {
          acc[m.key] = m.value;
          return acc;
        }, {});
        return { ...c, metafields };
      } catch {
        return { ...c, metafields: {} };
      }
    }));

    return res.status(200).json({
      pending:  pendingData.customers || [],
      approved: approvedWithMeta
    });
  } catch (err) {
    console.error('admin-customers error:', err);
    return res.status(500).json({ error: err.message });
  }
};
