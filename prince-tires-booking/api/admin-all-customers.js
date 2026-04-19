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

async function shopifyFetch(token, url) {
  const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await r.text();
    throw new Error(`Shopify API returned non-JSON (${r.status}): ${text.substring(0, 200)}`);
  }
  const data = await r.json();
  return { status: r.status, ok: r.ok, data, link: r.headers.get('Link') || '' };
}

function verifyAuth(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) throw new Error('No token');
  return jwt.verify(t, process.env.ADMIN_JWT_SECRET);
}

function getParam(req, key) {
  if (req.query && req.query[key]) return req.query[key];
  try { return new URL(req.url, 'http://x').searchParams.get(key); } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try { verifyAuth(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized' }); }

  try {
    const token    = await shopifyToken();
    const query    = getParam(req, 'query');
    const type     = getParam(req, 'type');
    const pageInfo = getParam(req, 'page_info');

    const fields = 'id,first_name,last_name,email,phone,tags,orders_count,created_at,note,state';
    let url;

    if (pageInfo) {
      url = `https://${SHOP}/admin/api/2024-10/customers.json?limit=250&page_info=${encodeURIComponent(pageInfo)}&fields=${fields}`;
    } else if (type === 'wholesale') {
      url = `https://${SHOP}/admin/api/2024-10/customers/search.json?query=tag:wholesale&limit=250&fields=${fields}`;
    } else if (type === 'retail') {
      url = `https://${SHOP}/admin/api/2024-10/customers.json?limit=250&fields=${fields}`;
    } else if (type === 'signed_in') {
      url = `https://${SHOP}/admin/api/2024-10/customers/search.json?query=state:enabled&limit=250&fields=${fields}`;
    } else if (type === 'wholesale_signed_in') {
      url = `https://${SHOP}/admin/api/2024-10/customers/search.json?query=tag:wholesale+state:enabled&limit=250&fields=${fields}`;
    } else if (query) {
      url = `https://${SHOP}/admin/api/2024-10/customers/search.json?query=${encodeURIComponent(query)}&limit=250&fields=${fields}`;
    } else {
      url = `https://${SHOP}/admin/api/2024-10/customers.json?limit=250&fields=${fields}`;
    }

    const { status, ok, data, link } = await shopifyFetch(token, url);

    if (!ok) {
      console.error('Shopify customers error:', status, data);
      return res.status(500).json({ error: `Shopify API error ${status}`, details: data.errors || data });
    }

    let customers = data.customers || [];

    if (type === 'retail') {
      customers = customers.filter(c => !(c.tags || '').includes('wholesale'));
    }

    let nextPageInfo = null;
    const nextMatch = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) nextPageInfo = nextMatch[1];

    return res.status(200).json({ customers, nextPageInfo, total: customers.length });
  } catch (err) {
    console.error('admin-all-customers error:', err);
    return res.status(500).json({ error: err.message });
  }
};
