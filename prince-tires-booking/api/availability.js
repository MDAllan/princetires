'use strict';
const { google } = require('googleapis');
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
} = require('./_lib/security');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 30 requests per minute per IP (calendar availability is read-only)
  if (!rateLimit(req, res, 30, 60_000)) return;

  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  // Reject dates more than 6 months in the future to prevent abuse
  const requested = new Date(date);
  const maxDate   = new Date();
  maxDate.setMonth(maxDate.getMonth() + 6);
  if (requested > maxDate || requested < new Date('2020-01-01')) {
    return res.status(400).json({ error: 'Date out of range.' });
  }

  let serviceAccountCreds;
  try {
    serviceAccountCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    console.error('availability: invalid GOOGLE_SERVICE_ACCOUNT_KEY');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountCreds,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

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
      const end   = new Date(event.end.dateTime);

      let current = new Date(start);
      while (current < end) {
        const label = current.toLocaleTimeString('en-US', {
          timeZone: 'America/Edmonton',
          hour:     'numeric',
          minute:   '2-digit',
          hour12:   true,
        });
        booked.push(label);
        current.setMinutes(current.getMinutes() + 30);
      }
    });

    // Block lunch hour every day
    booked.push('12:00 PM', '12:30 PM');

    return res.status(200).json({ booked: [...new Set(booked)] });
  } catch (error) {
    console.error('Calendar availability error:', error);
    // Return empty booked list on calendar errors so UI degrades gracefully
    return res.status(200).json({ booked: [] });
  }
};
