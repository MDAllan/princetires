const jwt = require('jsonwebtoken');

const SHOP = 'prince-tires-5560.myshopify.com';
const CID  = process.env.SHOPIFY_CLIENT_ID;
const CSEC = process.env.SHOPIFY_CLIENT_SECRET;

async function shopifyToken() {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${CID}&client_secret=${CSEC}`
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed: ' + JSON.stringify(d));
  return d.access_token;
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
    const token = await shopifyToken();

    const customerId = getParam(req, 'customer_id');
    const pageInfo   = getParam(req, 'page_info');

    let url;
    if (customerId) {
      // Orders for a specific customer
      url = `customers/${customerId}/orders.json?status=any&limit=50&fields=id,order_number,name,email,created_at,financial_status,fulfillment_status,total_price,line_items,customer`;
    } else if (pageInfo) {
      url = `orders.json?status=any&limit=50&page_info=${pageInfo}&fields=id,order_number,name,email,created_at,financial_status,fulfillment_status,total_price,line_items,customer`;
    } else {
      url = `orders.json?status=any&limit=50&fields=id,order_number,name,email,created_at,financial_status,fulfillment_status,total_price,line_items,customer`;
    }

    const r = await fetch(`https://${SHOP}/admin/api/2024-10/${url}`, {
      headers: { 'X-Shopify-Access-Token': token }
    });

    let data;
    const contentType = r.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await r.json();
    } else {
      const text = await r.text();
      return res.status(500).json({ error: `Shopify returned non-JSON (${r.status})`, details: text.substring(0, 300) });
    }

    if (r.status === 403) {
      return res.status(403).json({
        error: 'Orders access not approved',
        fix: 'Go to Shopify Admin → Settings → Apps and sales channels → your app → enable Read orders permission, then reinstall.'
      });
    }

    if (!r.ok) {
      console.error('Shopify orders error:', r.status, data);
      return res.status(500).json({ error: `Shopify API error ${r.status}`, details: data.errors || data });
    }

    // Extract next/prev page cursors from Link header
    const link = r.headers.get('Link') || '';
    let nextPageInfo = null;
    let prevPageInfo = null;

    const nextMatch = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    const prevMatch = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="previous"/);
    if (nextMatch) nextPageInfo = nextMatch[1];
    if (prevMatch) prevPageInfo = prevMatch[1];

    return res.status(200).json({
      orders:       data.orders || [],
      nextPageInfo,
      prevPageInfo
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
