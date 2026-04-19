const jwt       = require('jsonwebtoken');
const { google } = require('googleapis');

function verifyAuth(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) throw new Error('No token');
  return jwt.verify(t, process.env.ADMIN_JWT_SECRET);
}

async function getCalendar() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try { verifyAuth(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized' }); }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }

  const calendar = await getCalendar();

  // ── GET: fetch single event ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const id = (req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id');
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: id });
      return res.status(200).json({ event: event.data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PUT: update event (reschedule or edit details) ───────────────────────────
  if (req.method === 'PUT') {
    const { id, date, time, notes, customer, phone, email } = b || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    try {
      // Fetch current event first
      const current = (await calendar.events.get({ calendarId: CALENDAR_ID, eventId: id })).data;

      let startDateTime = current.start.dateTime;
      let endDateTime   = current.end.dateTime;

      // If date/time provided, rebuild start/end
      if (date && time) {
        const timeParts = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!timeParts) return res.status(400).json({ error: 'Invalid time format. Use HH:MM AM/PM' });
        let hour = parseInt(timeParts[1]);
        const min  = parseInt(timeParts[2]);
        const ampm = timeParts[3].toUpperCase();
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        const h24 = `${hour < 10 ? '0' : ''}${hour}:${min < 10 ? '0' : ''}${min}`;

        // Preserve original duration
        const origStart = new Date(current.start.dateTime);
        const origEnd   = new Date(current.end.dateTime);
        const durationMs = origEnd - origStart;

        const newStart = new Date(`${date}T${h24}:00`);
        const newEnd   = new Date(newStart.getTime() + durationMs);

        startDateTime = newStart.toISOString();
        endDateTime   = newEnd.toISOString();
      }

      // Update description lines if provided
      let description = current.description || '';
      if (customer) description = description.replace(/^Customer:.*$/m, `Customer: ${customer}`);
      if (phone)    description = description.replace(/^Phone:.*$/m, `Phone: ${phone}`);
      if (email)    description = description.replace(/^Email:.*$/m, `Email: ${email}`);
      if (notes !== undefined) {
        if (/^Notes:.*$/m.test(description)) {
          description = description.replace(/^Notes:.*$/m, notes ? `Notes: ${notes}` : '');
        } else if (notes) {
          description += `\nNotes: ${notes}`;
        }
      }

      const updated = await calendar.events.update({
        calendarId: CALENDAR_ID,
        eventId: id,
        requestBody: {
          ...current,
          start: { dateTime: startDateTime, timeZone: 'America/Edmonton' },
          end:   { dateTime: endDateTime,   timeZone: 'America/Edmonton' },
          description,
        },
      });

      return res.status(200).json({ success: true, event: updated.data });
    } catch (err) {
      console.error('Update event error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE: cancel/delete event ───────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = b?.id || (req.query && req.query.id);
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: id });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Delete event error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
};
