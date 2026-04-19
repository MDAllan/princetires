'use strict';
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
  validateId,
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

async function shopifyReq(token, method, path, body) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-10/${path}`, {
    method,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body:    body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`Shopify non-JSON (${r.status})`);
  return r.json();
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'WHOLESALE-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // A01: authenticate before doing anything else
  try { verifyAdminAuth(req); } catch {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!rateLimit(req, res, 30, 60_000)) return;

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }

  const { mode, discount } = b || {};

  // ── MODE: update-discount ─────────────────────────────────────────────────
  if (mode === 'update-discount') {
    const customerId = validateId(b.customerId);
    if (!customerId) return res.status(400).json({ error: 'Valid customerId required.' });

    const pct = parseInt(discount, 10);
    if (isNaN(pct) || pct < 1 || pct > 100) {
      return res.status(400).json({ error: 'Discount must be 1–100.' });
    }

    try {
      const token = await shopifyToken();

      const [custData, metaData] = await Promise.all([
        shopifyReq(token, 'GET', `customers/${customerId}.json`),
        shopifyReq(token, 'GET', `customers/${customerId}/metafields.json`),
      ]);

      const cust = custData.customer;
      if (!cust) return res.status(404).json({ error: 'Customer not found.' });

      const mf = (metaData.metafields || []).reduce((acc, m) => {
        acc[m.key] = { value: m.value, id: m.id };
        return acc;
      }, {});

      const priceRuleId = mf.wholesale_price_rule_id?.value;
      let updatedCode   = mf.wholesale_code?.value || null;
      let resolvedRuleId = priceRuleId;

      if (priceRuleId) {
        const updated = await shopifyReq(token, 'PUT', `price_rules/${priceRuleId}.json`, {
          price_rule: { id: priceRuleId, value: `-${pct}` },
        });
        if (!updated.price_rule) resolvedRuleId = null;
      }

      if (!resolvedRuleId) {
        const priceRuleRes = await shopifyReq(token, 'POST', 'price_rules.json', {
          price_rule: {
            title:                    `Wholesale - ${cust.email}`,
            target_type:              'line_item',
            target_selection:         'all',
            allocation_method:        'across',
            value_type:               'percentage',
            value:                    `-${pct}`,
            customer_selection:       'prerequisite',
            prerequisite_customer_ids: [customerId],
            usage_limit:              null,
            once_per_customer:        false,
            starts_at:                new Date().toISOString(),
          },
        });
        const newRule = priceRuleRes.price_rule;
        if (!newRule) return res.status(500).json({ error: 'Failed to create price rule.' });
        resolvedRuleId = newRule.id;
        const newCode  = makeCode();
        await shopifyReq(token, 'POST', `price_rules/${newRule.id}/discount_codes.json`, { discount_code: { code: newCode } });
        updatedCode = newCode;
        await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, { metafield: { namespace: 'custom', key: 'wholesale_code',           value: newCode,                   type: 'single_line_text_field' } });
        await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, { metafield: { namespace: 'custom', key: 'wholesale_price_rule_id',  value: String(resolvedRuleId),    type: 'single_line_text_field' } });
      }

      if (mf.wholesale_discount?.id) {
        await shopifyReq(token, 'PUT', `metafields/${mf.wholesale_discount.id}.json`, {
          metafield: { id: mf.wholesale_discount.id, value: String(pct), type: 'number_integer' },
        });
      } else {
        await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, { metafield: { namespace: 'custom', key: 'wholesale_discount', value: String(pct), type: 'number_integer' } });
      }

      return res.status(200).json({ success: true, discount: pct, code: updatedCode, priceRuleId: resolvedRuleId });
    } catch (err) {
      console.error('update-discount error:', err);
      return res.status(500).json({ error: 'Failed to update discount.' });
    }
  }

  // ── MODE: approve (default) ───────────────────────────────────────────────
  const customerId    = validateId(b.customerId);
  const globalDiscount = parseInt(b.globalDiscount, 10);
  const productOverrides = b.productOverrides;

  if (!customerId) return res.status(400).json({ error: 'Valid customerId required.' });
  if (isNaN(globalDiscount) || globalDiscount < 1 || globalDiscount > 100) {
    return res.status(400).json({ error: 'globalDiscount must be 1–100.' });
  }

  try {
    const token = await shopifyToken();

    const custData = await shopifyReq(token, 'GET', `customers/${customerId}.json`);
    const cust     = custData.customer;
    if (!cust) return res.status(404).json({ error: 'Customer not found.' });

    const tags    = (cust.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const newTags = tags.filter(t => t !== 'wholesale-pending');
    if (!newTags.includes('wholesale')) newTags.push('wholesale');

    await shopifyReq(token, 'PUT', `customers/${customerId}.json`, {
      customer: { id: customerId, tags: newTags.join(', ') },
    });

    await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, {
      metafield: { namespace: 'custom', key: 'wholesale_discount', value: String(globalDiscount), type: 'number_integer' },
    });

    if (Array.isArray(productOverrides) && productOverrides.length > 0) {
      await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, {
        metafield: { namespace: 'custom', key: 'wholesale_product_overrides', value: JSON.stringify(productOverrides), type: 'json' },
      });
    }

    const code         = makeCode();
    const priceRuleRes = await shopifyReq(token, 'POST', 'price_rules.json', {
      price_rule: {
        title:                    `Wholesale - ${cust.email}`,
        target_type:              'line_item',
        target_selection:         'all',
        allocation_method:        'across',
        value_type:               'percentage',
        value:                    `-${globalDiscount}`,
        customer_selection:       'prerequisite',
        prerequisite_customer_ids: [customerId],
        usage_limit:              null,
        once_per_customer:        false,
        starts_at:                new Date().toISOString(),
      },
    });

    const priceRule = priceRuleRes.price_rule;
    if (!priceRule) {
      console.error('Price rule creation failed:', priceRuleRes);
      return res.status(500).json({ error: 'Failed to create price rule.' });
    }

    await shopifyReq(token, 'POST', `price_rules/${priceRule.id}/discount_codes.json`, { discount_code: { code } });
    await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, { metafield: { namespace: 'custom', key: 'wholesale_code',          value: code,                  type: 'single_line_text_field' } });
    await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, { metafield: { namespace: 'custom', key: 'wholesale_price_rule_id', value: String(priceRule.id), type: 'single_line_text_field' } });

    return res.status(200).json({ success: true, code, discount: globalDiscount, priceRuleId: priceRule.id });
  } catch (err) {
    console.error('admin-approve error:', err);
    return res.status(500).json({ error: 'Failed to approve customer.' });
  }
};
