const jwt       = require('jsonwebtoken');
const { google } = require('googleapis');

function verifyAuth(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) throw new Error('No token');
  return jwt.verify(t, process.env.ADMIN_JWT_SECRET);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try { verifyAuth(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized' }); }

  let serviceAccountCreds;
  try {
    serviceAccountCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch (e) {
    return res.status(500).json({ error: 'Server misconfiguration: invalid service account key' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountCreds,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Fetch all history: past 2 years + next 1 year
    const timeMin = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // Paginate through all events (Google returns max 2500 per page)
    let allItems = [];
    let pageToken = undefined;
    do {
      const resp = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        pageToken,
      });
      allItems = allItems.concat(resp.data.items || []);
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    const events = allItems.map(e => ({
      id:          e.id,
      title:       e.summary || '',
      description: e.description || '',
      start:       e.start?.dateTime || e.start?.date,
      end:         e.end?.dateTime   || e.end?.date,
      location:    e.location || '',
    }));

    return res.status(200).json({ events });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
