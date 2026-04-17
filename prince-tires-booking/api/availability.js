const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Use MST offset (-07:00) which is the wider window; covers both MDT and MST
    // since business hours never fall near midnight, the 1-hr overlap is harmless
    const timeMin = `${date}T00:00:00-07:00`;
    const timeMax = `${date}T23:59:59-07:00`;

    const response = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'America/Edmonton',
    });

    const events = response.data.items || [];
    const booked = [];

    events.forEach(event => {
      if (!event.start || !event.start.dateTime) return;

      const start = new Date(event.start.dateTime);
      const end = new Date(event.end.dateTime);

      // Generate all 30-min slots this event covers, in Mountain time (America/Edmonton)
      // Vercel runs in UTC, so we must format in the local timezone to match the slot labels
      let current = new Date(start);
      while (current < end) {
        const label = current.toLocaleTimeString('en-US', {
          timeZone: 'America/Edmonton',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        booked.push(label);
        current.setMinutes(current.getMinutes() + 30);
      }
    });

    return res.status(200).json({ booked: [...new Set(booked)] });
  } catch (error) {
    console.error('Calendar availability error:', error);
    return res.status(200).json({ booked: [] });
  }
};
