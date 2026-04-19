'use strict';
const { google } = require('googleapis');
const {
  setSecurityHeaders,
  rateLimit,
  sanitize,
  verifyCancelToken,
} = require('./_lib/security');

// Simple HTML page helpers
function htmlPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Prince Tires</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;max-width:480px;width:100%;padding:40px 32px;text-align:center}
    h1{font-size:22px;margin:0 0 12px;color:#111}
    p{color:#6b7280;font-size:15px;margin:0 0 24px;line-height:1.5}
    .btn{display:inline-block;padding:12px 28px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none}
    .btn--gray{background:#6b7280}
    .icon{font-size:48px;margin:0 0 16px;display:block}
  </style>
</head>
<body>
  <div class="card">${bodyHtml}</div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Rate limit: 10 requests per 5 minutes per IP
  if (!rateLimit(req, res, 10, 300_000)) return;

  const url    = new URL(req.url, 'http://localhost');
  const id     = sanitize(url.searchParams.get('id') || '', 100);
  const token  = (url.searchParams.get('token') || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);

  // Validate inputs
  if (!id || !token) {
    return res.status(400).send(htmlPage('Invalid link',
      `<span class="icon">⚠️</span>
       <h1>Invalid cancellation link</h1>
       <p>This link is missing required information. Please use the link from your booking confirmation email.</p>
       <a href="https://princetires.ca" class="btn btn--gray">Back to Prince Tires</a>`
    ));
  }

  // Verify HMAC cancel token — prevents arbitrary event deletions
  if (!verifyCancelToken(id, token)) {
    return res.status(403).send(htmlPage('Link expired or invalid',
      `<span class="icon">🔒</span>
       <h1>This cancellation link is not valid</h1>
       <p>The link may have expired or already been used. Please contact us directly to cancel your booking.</p>
       <a href="https://princetires.ca/pages/contact" class="btn btn--gray">Contact us</a>`
    ));
  }

  // Load Google Calendar credentials
  let creds;
  try {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    console.error('cancel: invalid GOOGLE_SERVICE_ACCOUNT_KEY');
    return res.status(500).send(htmlPage('Server error',
      `<span class="icon">⚠️</span>
       <h1>Something went wrong</h1>
       <p>We couldn't process your cancellation. Please contact us directly.</p>
       <a href="https://princetires.ca/pages/contact" class="btn">Contact us</a>`
    ));
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // Fetch the event first to confirm it exists and is upcoming
    let event;
    try {
      const resp = await calendar.events.get({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        eventId:    id,
      });
      event = resp.data;
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 410) {
        return res.status(200).send(htmlPage('Already cancelled',
          `<span class="icon">✅</span>
           <h1>Booking already removed</h1>
           <p>This appointment has already been cancelled or doesn't exist.</p>
           <a href="https://princetires.ca" class="btn btn--gray">Back to Prince Tires</a>`
        ));
      }
      throw err;
    }

    // Don't allow cancelling past events
    const startTime = event.start?.dateTime || event.start?.date;
    if (startTime) {
      const startDate = new Date(startTime);
      if (startDate < new Date()) {
        return res.status(200).send(htmlPage('Appointment already passed',
          `<span class="icon">📅</span>
           <h1>This appointment has already passed</h1>
           <p>We can't cancel a booking for a date that has already occurred. Contact us if you need assistance.</p>
           <a href="https://princetires.ca/pages/contact" class="btn">Contact us</a>`
        ));
      }
    }

    // Delete the event from Google Calendar
    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId:    id,
    });

    const dateLabel = startTime
      ? new Date(startTime).toLocaleString('en-CA', {
          timeZone: 'America/Edmonton',
          weekday: 'long', month: 'long', day: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        })
      : 'your appointment';

    return res.status(200).send(htmlPage('Booking cancelled',
      `<span class="icon">✅</span>
       <h1>Your booking has been cancelled</h1>
       <p>We've cancelled your appointment on <strong>${dateLabel}</strong> (Mountain Time).</p>
       <p style="margin:0 0 8px">If you'd like to book a new time, use the button below.</p>
       <a href="https://princetires.ca" class="btn" style="margin-right:12px">Book again</a>
       <a href="https://princetires.ca/pages/contact" class="btn btn--gray">Contact us</a>`
    ));

  } catch (err) {
    console.error('cancel: calendar error', err);
    return res.status(500).send(htmlPage('Something went wrong',
      `<span class="icon">⚠️</span>
       <h1>Couldn't cancel your booking</h1>
       <p>There was a problem processing your request. Please try again or contact us directly.</p>
       <a href="https://princetires.ca/pages/contact" class="btn">Contact us</a>`
    ));
  }
};
