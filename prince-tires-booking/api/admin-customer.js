'use strict';
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
  validateId,
  sanitize,
  sanitizeEmail,
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
  if (!ct.includes('application/json')) throw new Error(`Shopify token non-JSON (${r.status})`);
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed');
  return d.access_token;
}

async function shopifyReq(token, method, path, body) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-10/${path}`, {
    method,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body:    body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, PUT, DELETE, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // A01: authenticate before doing anything else
  try { verifyAdminAuth(req); } catch {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!rateLimit(req, res, 60, 60_000)) return;

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }

  try {
    const token = await shopifyToken();

    // ── GET: customer + orders + metafields ───────────────────────────────
    if (req.method === 'GET') {
      const rawId = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
      const id    = validateId(rawId);
      if (!id) return res.status(400).json({ error: 'Valid customer id required.' });

      const [custData, ordersData, metaData] = await Promise.all([
        shopifyReq(token, 'GET', `customers/${id}.json`),
        shopifyReq(token, 'GET', `customers/${id}/orders.json?status=any&limit=250`).catch(() => ({ orders: [] })),
        shopifyReq(token, 'GET', `customers/${id}/metafields.json`),
      ]);

      const metafields = (metaData.metafields || []).reduce((acc, m) => {
        acc[m.key] = m.value;
        return acc;
      }, {});

      return res.status(200).json({
        customer:  custData.customer,
        orders:    ordersData.orders || [],
        metafields,
      });
    }

    // ── PUT: update customer fields ───────────────────────────────────────
    if (req.method === 'PUT') {
      const id = validateId(b?.id);
      if (!id) return res.status(400).json({ error: 'Valid customer id required.' });

      const updatePayload = { id };
      if (b.first_name !== undefined) updatePayload.first_name = sanitize(b.first_name, 50);
      if (b.last_name  !== undefined) updatePayload.last_name  = sanitize(b.last_name,  50);
      if (b.email      !== undefined) {
        const cleanEmail = sanitizeEmail(b.email);
        if (!cleanEmail) return res.status(400).json({ error: 'Invalid email address.' });
        updatePayload.email = cleanEmail;
      }
      if (b.phone !== undefined) updatePayload.phone = sanitize(b.phone, 30);
      if (b.note  !== undefined) updatePayload.note  = sanitize(b.note,  1000);
      if (b.tags  !== undefined) updatePayload.tags  = sanitize(b.tags,  500);

      const updated = await shopifyReq(token, 'PUT', `customers/${id}.json`, { customer: updatePayload });

      if (b.discount !== undefined) {
        const pct = parseInt(b.discount, 10);
        if (!isNaN(pct) && pct >= 0 && pct <= 100) {
          await shopifyReq(token, 'POST', `customers/${id}/metafields.json`, {
            metafield: {
              namespace: 'custom',
              key:       'wholesale_discount',
              value:     String(pct),
              type:      'number_integer',
            },
          });
        }
      }

      return res.status(200).json({ customer: updated.customer });
    }

    // ── DELETE: remove customer ───────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = validateId(b?.id || req.query?.id);
      if (!id) return res.status(400).json({ error: 'Valid customer id required.' });

      const r = await fetch(`https://${SHOP}/admin/api/2024-10/customers/${id}.json`, {
        method:  'DELETE',
        headers: { 'X-Shopify-Access-Token': token },
      });

      if (r.status === 200 || r.status === 204) {
        return res.status(200).json({ success: true });
      }
      const errData = await r.json();
      return res.status(r.status).json({ error: errData.errors || 'Delete failed.' });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('admin-customer error:', err);
    return res.status(500).json({ error: 'An error occurred.' });
  }
};
