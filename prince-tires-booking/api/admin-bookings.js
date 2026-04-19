'use strict';
const { google } = require('googleapis');
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
} = require('./_lib/security');

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

    const events = allItems.map(e => ({
      id:          e.id,
      title:       e.summary       || '',
      description: e.description   || '',
      start:       e.start?.dateTime || e.start?.date,
      end:         e.end?.dateTime   || e.end?.date,
      location:    e.location      || '',
    }));

    return res.status(200).json({ events });
  } catch (err) {
    console.error('admin-bookings error:', err);
    return res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
};
