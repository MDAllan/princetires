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

  try { verifyAuth(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized' }); }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Fetch past 60 days + next 90 days
    const timeMin = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const resp = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
    });

    const events = (resp.data.items || []).map(e => ({
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
