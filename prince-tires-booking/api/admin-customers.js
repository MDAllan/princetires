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
  if (!ct.includes('application/json')) throw new Error(`Shopify token endpoint non-JSON (${r.status})`);
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed');
  return d.access_token;
}

async function shopifyGet(token, path) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-10/${path}`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`Shopify API non-JSON (${r.status})`);
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
    const token = await shopifyToken();

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
  } catch (err) {
    console.error('admin-customers error:', err);
    return res.status(500).json({ error: 'Failed to fetch customers.' });
  }
};
