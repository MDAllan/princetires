'use strict';
const { google } = require('googleapis');
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
} = require('./_lib/security');

const SHOP = 'prince-tires-5560.myshopify.com';

async function shopifyToken() {
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=client_credentials&client_id=${process.env.SHOPIFY_CLIENT_ID}&client_secret=${process.env.SHOPIFY_CLIENT_SECRET}`,
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`Token endpoint non-JSON (${r.status})`);
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

  // Rate limit: 60 per minute for admin calendar reads
  if (!rateLimit(req, res, 60, 60_000)) return;

  // ── ?mode=stats  — customer + order counts (merged from admin-stats.js) ──────
  if (getParam(req, 'mode') === 'stats') {
    try {
      const token   = await shopifyToken();
      const base    = `https://${SHOP}/admin/api/2024-10`;
      const headers = { 'X-Shopify-Access-Token': token };
      const [custRes, orderRes] = await Promise.all([
        fetch(`${base}/customers/count.json`, { headers }),
        fetch(`${base}/orders/count.json?status=any`, { headers }),
      ]);
      const custData  = custRes.headers.get('content-type')?.includes('application/json')  ? await custRes.json()  : null;
      const orderData = orderRes.headers.get('content-type')?.includes('application/json') ? await orderRes.json() : null;
      return res.status(200).json({
        customers: custData?.count  ?? 0,
        orders:    orderData?.count ?? 0,
      });
    } catch (err) {
      console.error('admin-bookings stats error:', err);
      return res.status(500).json({ error: 'Failed to fetch stats.' });
    }
  }

  let serviceAccountCreds;
  try {
    serviceAccountCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    console.error('admin-bookings: invalid GOOGLE_SERVICE_ACCOUNT_KEY');
    return res.status(500).json({ error: 'Server configuration error.' });
  }


  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountCreds,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // Fetch past 2 years + next 1 year
    const timeMin = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    let allItems  = [];
    let pageToken;
    do {
      const resp = await calendar.events.list({
        calendarId:   process.env.GOOGLE_CALENDAR_ID || 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy:      'startTime',
        maxResults:   2500,
        pageToken,
      });
      allItems  = allItems.concat(resp.data.items || []);
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    const events = allItems
      .filter(e => e.description && e.description.includes('Booked via princetires.ca'))
      .map(e => ({
        id:          e.id,
        title:       e.summary       || '',
        description: e.description   || '',
        start:       e.start?.dateTime || e.start?.date,
        end:         e.end?.dateTime   || e.end?.date,
        location:    e.location      || '',
        pt_status:   e.extendedProperties?.private?.pt_status || 'confirmed',
      }));

    return res.status(200).json({ events });
  } catch (err) {
    console.error('admin-bookings error:', err);
    return res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
};
