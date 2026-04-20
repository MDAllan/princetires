'use strict';
/**
 * GET /api/remind
 * Vercel cron job — runs daily at 9 AM Mountain Time (15:00 UTC).
 * Finds all bookings scheduled for tomorrow and sends a 24h reminder email.
 *
 * Security: Vercel sets Authorization: Bearer <CRON_SECRET> on cron invocations.
 * Reject any request that doesn't carry that header.
 */
const { google } = require('googleapis');
const { escapeHtml } = require('./_lib/security');

function verifyCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET not configured');
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token !== secret) throw new Error('Unauthorized');
}

function extractField(description, label) {
  const lines = (description || '').split('\n');
  for (const line of lines) {
    const prefix = label + ': ';
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return '';
}

function tomorrowRange() {
  const tz = 'America/Edmonton';
  // Get tomorrow in Mountain Time
  const now = new Date();
  // Shift to Mountain Time offset (UTC-7 standard / UTC-6 daylight)
  // Use Intl to get the correct date string for tomorrow in that zone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  // "tomorrow" = now + 24h
  const tomorrowMs = now.getTime() + 24 * 60 * 60 * 1000;
  const tomorrowDate = formatter.format(new Date(tomorrowMs)); // YYYY-MM-DD
  return {
    timeMin: `${tomorrowDate}T00:00:00`,
    timeMax: `${tomorrowDate}T23:59:59`,
    dateLabel: tomorrowDate,
  };
}

module.exports = async function handler(req, res) {
  // Only GET (Vercel cron fires GET)
  if (req.method !== 'GET') return res.status(405).end();

  // A01: verify this came from Vercel cron
  try { verifyCron(req); } catch {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  let creds;
  try {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    console.error('remind: invalid GOOGLE_SERVICE_ACCOUNT_KEY');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const { timeMin, timeMax, dateLabel } = tomorrowRange();

    const resp = await calendar.events.list({
      calendarId:   process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin:      `${timeMin}-07:00`,
      timeMax:      `${timeMax}-07:00`,
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   50,
      timeZone:     'America/Edmonton',
    });

    const events = resp.data.items || [];
    if (events.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No bookings tomorrow.' });
    }

    const resendKey = process.env.RESEND_API_KEY;
    let sent = 0;
    const errors = [];

    for (const event of events) {
      const desc  = event.description || '';
      const email = extractField(desc, 'Email');
      const name  = extractField(desc, 'Customer');
      const phone = extractField(desc, 'Phone');

      if (!email || !email.includes('@')) continue;

      const startDT = new Date(event.start?.dateTime || event.start?.date);
      const timeStr = startDT.toLocaleTimeString('en-US', {
        timeZone: 'America/Edmonton',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
      const dateStr = startDT.toLocaleDateString('en-CA', {
        timeZone: 'America/Edmonton',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      const eName  = escapeHtml(name  || 'there');
      const eDate  = escapeHtml(dateStr);
      const eTime  = escapeHtml(timeStr);
      const ePhone = escapeHtml(phone || '403 452 4283');

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111">
          <div style="background:#dc2626;padding:24px 32px">
            <h1 style="color:#fff;margin:0;font-size:22px">Appointment Reminder</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px">Prince Tires &mdash; Calgary, AB</p>
          </div>
          <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none">
            <p style="font-size:16px;margin:0 0 20px">Hi ${eName}, just a reminder that your tire installation is <strong>tomorrow</strong>.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px 0;color:#6b7280;width:120px">Date</td><td style="padding:8px 0;font-weight:600">${eDate}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">Time</td><td style="padding:8px 0;font-weight:600">${eTime}</td></tr>
            </table>
            <div style="margin:24px 0;padding:16px;background:#f9fafb;border-radius:8px;font-size:14px">
              <strong>Location</strong><br>
              111 42 Ave SW, Calgary, AB T2G 0G3<br>
              <span style="color:#6b7280">Please arrive 5 minutes early.</span>
            </div>
            <p style="font-size:14px;margin:0 0 8px">Need to reschedule or cancel? Call us at <a href="tel:${ePhone}" style="color:#dc2626">${ePhone}</a> or reply to this email.</p>
            <p style="font-size:12px;color:#9ca3af;margin:24px 0 0">Prince Tires &mdash; 111 42 Ave SW, Calgary, AB T2G 0G3</p>
          </div>
        </div>`;

      if (!resendKey) {
        errors.push({ email, error: 'RESEND_API_KEY not configured' });
        continue;
      }

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            from:    'Prince Tires <bookings@princetires.ca>',
            to:      email,
            subject: `Reminder: tire installation tomorrow at ${timeStr}`,
            html:    emailHtml,
          }),
        });
        if (emailRes.ok) {
          sent++;
        } else {
          const errBody = await emailRes.text();
          errors.push({ email, error: errBody });
        }
      } catch (err) {
        errors.push({ email, error: err.message });
      }
    }

    console.log(`remind: ${sent} reminders sent for ${dateLabel}, ${errors.length} errors`);
    return res.status(200).json({ sent, errors: errors.length, dateLabel });

  } catch (err) {
    console.error('remind error:', err);
    return res.status(500).json({ error: 'Failed to send reminders.' });
  }
};
