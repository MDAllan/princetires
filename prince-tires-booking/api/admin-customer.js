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
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await r.text();
    throw new Error(`Shopify token endpoint returned non-JSON (${r.status}): ${text.substring(0, 200)}`);
  }
  const d = await r.json();
  if (!d.access_token) throw new Error('Shopify token failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function shopifyReq(token, method, path, body) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-10/${path}`, {
    method,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.json();
}

function verifyAuth(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) throw new Error('No token');
  return jwt.verify(t, process.env.ADMIN_JWT_SECRET);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try { verifyAuth(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized' }); }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }

  try {
    const token = await shopifyToken();

    // ── GET: customer + their orders ──────────────────────────────────────────
    if (req.method === 'GET') {
      const id = req.query?.id || (req.url && new URL(req.url, 'http://x').searchParams.get('id'));
      if (!id) return res.status(400).json({ error: 'id required' });

      const [custData, ordersData, metaData] = await Promise.all([
        shopifyReq(token, 'GET', `customers/${id}.json`),
        shopifyReq(token, 'GET', `customers/${id}/orders.json?status=any&limit=250`).catch(() => ({ orders: [] })),
        shopifyReq(token, 'GET', `customers/${id}/metafields.json`)
      ]);

      const metafields = (metaData.metafields || []).reduce((acc, m) => {
        acc[m.key] = m.value;
        return acc;
      }, {});

      return res.status(200).json({
        customer: custData.customer,
        orders:   ordersData.orders || [],
        metafields
      });
    }

    // ── PUT: update customer ──────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, first_name, last_name, email, phone, note, tags, discount } = b || {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const updatePayload = { id };
      if (first_name !== undefined) updatePayload.first_name = first_name;
      if (last_name  !== undefined) updatePayload.last_name  = last_name;
      if (email      !== undefined) updatePayload.email      = email;
      if (phone      !== undefined) updatePayload.phone      = phone;
      if (note       !== undefined) updatePayload.note       = note;
      if (tags       !== undefined) updatePayload.tags       = tags;

      const updated = await shopifyReq(token, 'PUT', `customers/${id}.json`, { customer: updatePayload });

      // Update wholesale discount metafield if provided
      if (discount !== undefined) {
        await shopifyReq(token, 'POST', `customers/${id}/metafields.json`, {
          metafield: {
            namespace: 'custom',
            key: 'wholesale_discount',
            value: String(discount),
            type: 'number_integer'
          }
        });
      }

      return res.status(200).json({ customer: updated.customer });
    }

    // ── DELETE: remove customer ───────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = b?.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'id required' });

      const r = await fetch(`https://${SHOP}/admin/api/2024-10/customers/${id}.json`, {
        method: 'DELETE',
        headers: { 'X-Shopify-Access-Token': token }
      });

      if (r.status === 200 || r.status === 204) {
        return res.status(200).json({ success: true });
      }
      const err = await r.json();
      return res.status(r.status).json({ error: err.errors || 'Delete failed' });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
