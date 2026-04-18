const jwt = require('jsonwebtoken');

const SHOP = 'prince-tires-5560.myshopify.com';
const CID  = process.env.SHOPIFY_CLIENT_ID;
const CSEC = process.env.SHOPIFY_CLIENT_SECRET;

async function shopifyToken() {
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${CID}&client_secret=${CSEC}`
  });
  const d = await r.json();
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
  const auth = req.headers.authorization || '';
  const t    = auth.replace('Bearer ', '');
  if (!t) throw new Error('No token');
  return jwt.verify(t, process.env.ADMIN_JWT_SECRET);
}

// Generate a unique discount code like WHOLESALE-A3X9K2
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'WHOLESALE-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try { verifyAuth(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized' }); }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }

  // customerId: Shopify customer numeric ID
  // globalDiscount: number 0-100 (percent off)
  // productOverrides: [{ productId, discount }] — optional per-product %
  const { customerId, globalDiscount, productOverrides } = b || {};

  if (!customerId || globalDiscount === undefined) {
    return res.status(400).json({ error: 'customerId and globalDiscount required' });
  }

  try {
    const token = await shopifyToken();

    // 1. Remove wholesale-pending tag, add wholesale tag
    const custData = await shopifyReq(token, 'GET', `customers/${customerId}.json`);
    const cust = custData.customer;
    if (!cust) return res.status(404).json({ error: 'Customer not found' });

    const tags = (cust.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const newTags = tags.filter(t => t !== 'wholesale-pending');
    if (!newTags.includes('wholesale')) newTags.push('wholesale');

    await shopifyReq(token, 'PUT', `customers/${customerId}.json`, {
      customer: { id: customerId, tags: newTags.join(', ') }
    });

    // 2. Save global discount % as metafield
    await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, {
      metafield: {
        namespace: 'custom',
        key: 'wholesale_discount',
        value: String(globalDiscount),
        type: 'number_integer'
      }
    });

    // 3. Save product overrides as metafield (JSON string)
    if (productOverrides && productOverrides.length > 0) {
      await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, {
        metafield: {
          namespace: 'custom',
          key: 'wholesale_product_overrides',
          value: JSON.stringify(productOverrides),
          type: 'json'
        }
      });
    }

    // 4. Create a unique discount code for this customer
    const code = makeCode();

    // Create price rule: percentage discount, customer-specific (limit to 1 use per customer)
    const priceRuleRes = await shopifyReq(token, 'POST', 'price_rules.json', {
      price_rule: {
        title: `Wholesale - ${cust.email}`,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        value_type: 'percentage',
        value: `-${globalDiscount}`,
        customer_selection: 'prerequisite',
        prerequisite_customer_ids: [customerId],
        usage_limit: null,
        once_per_customer: false,
        starts_at: new Date().toISOString()
      }
    });

    const priceRule = priceRuleRes.price_rule;
    if (!priceRule) {
      console.error('Price rule creation failed:', priceRuleRes);
      return res.status(500).json({ error: 'Failed to create price rule', detail: priceRuleRes });
    }

    // Create discount code under the price rule
    await shopifyReq(token, 'POST', `price_rules/${priceRule.id}/discount_codes.json`, {
      discount_code: { code }
    });

    // Save the code to metafield so we can display it in the portal
    await shopifyReq(token, 'POST', `customers/${customerId}/metafields.json`, {
      metafield: {
        namespace: 'custom',
        key: 'wholesale_code',
        value: code,
        type: 'single_line_text_field'
      }
    });

    return res.status(200).json({ success: true, code, discount: globalDiscount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
