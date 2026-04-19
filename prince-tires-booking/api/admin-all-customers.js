'use strict';
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
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
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`Shopify token endpoint non-JSON (${r.status})`);
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed');
  return d.access_token;
}

async function shopifyFetch(token, url) {
  const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`Shopify API non-JSON (${r.status})`);
  const data = await r.json();
  return { status: r.status, ok: r.ok, data, link: r.headers.get('Link') || '' };
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
    const token    = await shopifyToken();
    // Sanitize query params before using in Shopify search URL
    const mode     = sanitize(getParam(req, 'mode')  || '', 30);
    const query    = sanitize(getParam(req, 'query') || '', 100);
    const type     = sanitize(getParam(req, 'type')  || '', 50);
    const pageInfo = sanitize(getParam(req, 'page_info') || '', 200);

    // ── Wholesale mode (merged from admin-customers.js) ──────────────────────
    // Returns { pending, approved } with metafields for the Wholesale section
    if (mode === 'wholesale') {
      async function shopifyGet(t, path) {
        const r = await fetch(`https://${SHOP}/admin/api/2024-10/${path}`, {
          headers: { 'X-Shopify-Access-Token': t },
        });
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error(`Shopify API non-JSON (${r.status})`);
        return r.json();
      }

      const [pendingData, approvedData] = await Promise.all([
        shopifyGet(token, 'customers/search.json?query=tag:wholesale-pending&limit=250&fields=id,first_name,last_name,email,phone,tags,note,created_at,orders_count,state'),
        shopifyGet(token, 'customers/search.json?query=tag:wholesale&limit=250&fields=id,first_name,last_name,email,phone,tags,note,created_at,orders_count,state'),
      ]);

      const approved = approvedData.customers || [];
      const approvedWithMeta = await Promise.all(approved.map(async (c) => {
        try {
          const mf         = await shopifyGet(token, `customers/${c.id}/metafields.json`);
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
        approved: approvedWithMeta,
      });
    }

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
      return res.status(500).json({ error: 'Failed to fetch customers.' });
    }

    let customers = data.customers || [];
    if (type === 'retail') {
      customers = customers.filter(c => !(c.tags || '').includes('wholesale'));
    }

    let nextPageInfo = null;
    const nextMatch  = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) nextPageInfo = nextMatch[1];

    return res.status(200).json({ customers, nextPageInfo, total: customers.length });
  } catch (err) {
    console.error('admin-all-customers error:', err);
    return res.status(500).json({ error: 'Failed to fetch customers.' });
  }
};
