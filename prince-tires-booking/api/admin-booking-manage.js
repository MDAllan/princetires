'use strict';
const { google } = require('googleapis');
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  verifyAdminAuth,
  validateId,
  sanitize,
  sanitizeEmail,
} = require('./_lib/security');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

async function getCalendar() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
    scopes:      ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, PUT, DELETE, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // A01: authenticate before doing anything else
  try { verifyAdminAuth(req); } catch {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!rateLimit(req, res, 60, 60_000)) return;

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }

  let calendar;
  try {
    calendar = await getCalendar();
  } catch {
    console.error('admin-booking-manage: failed to initialise Google Calendar client');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  // ── GET: fetch single event ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const rawId = (req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id');
    const id    = sanitize(rawId || '', 200);
    if (!id) return res.status(400).json({ error: 'Event id required.' });

    try {
      const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: id });
      return res.status(200).json({ event: event.data });
    } catch (err) {
      console.error('admin-booking-manage GET error:', err);
      return res.status(500).json({ error: 'Failed to fetch event.' });
    }
  }

  // ── PUT: update event (reschedule or edit details) ────────────────────────
  if (req.method === 'PUT') {
    const id = sanitize(b?.id || '', 200);
    if (!id) return res.status(400).json({ error: 'Event id required.' });

    const date     = sanitize(b?.date     || '', 10);
    const time     = sanitize(b?.time     || '', 10);
    const customer = sanitize(b?.customer || '', 80);
    const phone    = sanitize(b?.phone    || '', 30);
    const email    = b?.email ? (sanitizeEmail(b.email) || '') : '';
    const notes    = sanitize(b?.notes    || '', 500);

    // Validate date/time if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }
    if (time && !/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(time)) {
      return res.status(400).json({ error: 'Invalid time format. Use HH:MM AM/PM.' });
    }

    try {
      const current = (await calendar.events.get({ calendarId: CALENDAR_ID, eventId: id })).data;

      let startDateTime = current.start.dateTime;
      let endDateTime   = current.end.dateTime;

      if (date && time) {
        const timeParts = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
        let hour        = parseInt(timeParts[1], 10);
        const min       = parseInt(timeParts[2], 10);
        const ampm      = timeParts[3].toUpperCase();
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        const h24 = `${hour < 10 ? '0' : ''}${hour}:${min < 10 ? '0' : ''}${min}`;

        const origStart  = new Date(current.start.dateTime);
        const origEnd    = new Date(current.end.dateTime);
        const durationMs = origEnd - origStart;

        const newStart = new Date(`${date}T${h24}:00`);
        const newEnd   = new Date(newStart.getTime() + durationMs);

        startDateTime = newStart.toISOString();
        endDateTime   = newEnd.toISOString();
      }

      let description = current.description || '';
      if (customer) description = description.replace(/^Customer:.*$/m, `Customer: ${customer}`);
      if (phone)    description = description.replace(/^Phone:.*$/m,    `Phone: ${phone}`);
      if (email)    description = description.replace(/^Email:.*$/m,    `Email: ${email}`);
      if (notes !== undefined) {
        if (/^Notes:.*$/m.test(description)) {
          description = description.replace(/^Notes:.*$/m, notes ? `Notes: ${notes}` : '');
        } else if (notes) {
          description += `\nNotes: ${notes}`;
        }
      }

      const updated = await calendar.events.update({
        calendarId:  CALENDAR_ID,
        eventId:     id,
        requestBody: {
          ...current,
          start:       { dateTime: startDateTime, timeZone: 'America/Edmonton' },
          end:         { dateTime: endDateTime,   timeZone: 'America/Edmonton' },
          description,
        },
      });

      return res.status(200).json({ success: true, event: updated.data });
    } catch (err) {
      console.error('admin-booking-manage PUT error:', err);
      return res.status(500).json({ error: 'Failed to update event.' });
    }
  }

  // ── DELETE: cancel/delete event ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = sanitize(b?.id || (req.query && req.query.id) || '', 200);
    if (!id) return res.status(400).json({ error: 'Event id required.' });

    try {
      await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: id });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('admin-booking-manage DELETE error:', err);
      return res.status(500).json({ error: 'Failed to delete event.' });
    }
  }

  return res.status(405).end();
};
