'use strict';
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
  validateId,
  sanitize,
} = require('./_lib/security');

const SHOP = 'prince-tires-5560.myshopify.com';

async function shopifyToken() {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=client_credentials&client_id=${process.env.SHOPIFY_CLIENT_ID}&client_secret=${process.env.SHOPIFY_CLIENT_SECRET}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed');
  return d.access_token;
}

function getParam(req, key) {
  if (req.query && req.query[key]) return req.query[key];
  try { return new URL(req.url, 'http://x').searchParams.get(key); } catch { return null; }
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
    const token      = await shopifyToken();
    const customerId = validateId(getParam(req, 'customer_id'));
    const pageInfo   = sanitize(getParam(req, 'page_info') || '', 200);

    const fields = 'id,order_number,name,email,created_at,financial_status,fulfillment_status,total_price,line_items,customer';
    let url;

    if (customerId) {
      url = `customers/${customerId}/orders.json?status=any&limit=250&fields=${fields}`;
    } else if (pageInfo) {
      url = `orders.json?status=any&limit=250&page_info=${encodeURIComponent(pageInfo)}&fields=${fields}`;
    } else {
      url = `orders.json?status=any&limit=250&fields=${fields}`;
    }

    const r = await fetch(`https://${SHOP}/admin/api/2024-10/${url}`, {
      headers: { 'X-Shopify-Access-Token': token },
    });

    const contentType = r.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('admin-orders: Shopify returned non-JSON', r.status);
      return res.status(500).json({ error: 'Upstream error.' });
    }

    const data = await r.json();

    if (r.status === 403) {
      return res.status(403).json({
        error: 'Orders access not approved. Enable Read orders permission in Shopify Admin → Apps → your app.',
      });
    }

    if (!r.ok) {
      console.error('Shopify orders error:', r.status, data);
      return res.status(500).json({ error: 'Failed to fetch orders.' });
    }

    const link         = r.headers.get('Link') || '';
    const nextMatch    = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    const prevMatch    = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="previous"/);
    const nextPageInfo = nextMatch ? nextMatch[1] : null;
    const prevPageInfo = prevMatch ? prevMatch[1] : null;

    return res.status(200).json({ orders: data.orders || [], nextPageInfo, prevPageInfo });
  } catch (err) {
    console.error('admin-orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};
