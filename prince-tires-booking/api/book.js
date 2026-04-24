'use strict';
const { google } = require('googleapis');
const {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  escapeHtml,
  sanitize,
  sanitizeEmail,
  generateLookupToken,
  verifyLookupToken,
  generateCancelToken,
} = require('./_lib/security');

// ── GET /api/book?email=X&token=Y  → upcoming bookings for this customer ──────
// token = HMAC(email, BOOKING_LOOKUP_SECRET) returned at booking time.
// Without a valid token the request is rejected (A01: broken access control fix).
async function handleGet(req, res) {
  // Strict rate limit: 5 per 5 minutes per IP to limit enumeration attempts
  if (!rateLimit(req, res, 5, 300_000)) return;

  const rawEmail = req.query?.email
    || (req.url && new URL(req.url, 'http://x').searchParams.get('email'));
  const token = req.query?.token
    || (req.url && new URL(req.url, 'http://x').searchParams.get('token'));

  const email = sanitizeEmail(rawEmail);
  if (!email) return res.status(400).json({ error: 'Valid email required.' });

  // A01: verify HMAC token — prevents arbitrary email lookups
  if (!verifyLookupToken(email, token)) {
    return res.status(401).json({ error: 'Invalid or missing lookup token.' });
  }

  let creds;
  try {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    console.error('book GET: invalid GOOGLE_SERVICE_ACCOUNT_KEY');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const now       = new Date();
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);

    const resp = await calendar.events.list({
      calendarId:   process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin:      now.toISOString(),
      timeMax:      sixMonths.toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   50,
      q:            email,
      timeZone:     'America/Edmonton',
    });

    const emailLower    = email.toLowerCase();
    const apiBase       = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://prince-tires-booking.vercel.app';

    const bookings   = (resp.data.items || [])
      .filter(e => e.description && e.description.toLowerCase().includes(emailLower))
      .map(e => {
        const start = new Date(e.start?.dateTime || e.start?.date);
        let cancelUrl = null;
        try {
          const ct = generateCancelToken(e.id);
          cancelUrl = `${apiBase}/api/cancel?id=${encodeURIComponent(e.id)}&token=${encodeURIComponent(ct)}`;
        } catch {}
        return {
          id:        e.id,
          summary:   e.summary || 'Installation',
          date:      start.toLocaleDateString('en-CA', {
            timeZone: 'America/Edmonton',
            weekday:  'short',
            month:    'short',
            day:      'numeric',
            year:     'numeric',
          }),
          time:      start.toLocaleTimeString('en-US', {
            timeZone: 'America/Edmonton',
            hour:     'numeric',
            minute:   '2-digit',
            hour12:   true,
          }),
          location:  e.location || '111 42 Ave SW, Calgary, AB',
          status:    e.status   || 'confirmed',
          cancelUrl,
        };
      });

    return res.status(200).json({ bookings });
  } catch {
    return res.status(200).json({ bookings: [] });
  }
}

// ── POST /api/book  → create calendar event + send confirmation email ─────────
async function handlePost(req, res) {
  // Rate limit: 10 bookings per 10 minutes per IP
  if (!rateLimit(req, res, 10, 600_000)) return;

  let b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { b = null; }
  }

  if (!b || !b.name || !b.date || !b.time) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // ── Input validation & sanitization (A03: injection prevention) ─────────────
  const name           = sanitize(b.name,            80);
  const phone          = sanitize(b.phone,           30);
  const vehicleType    = sanitize(b.vehicleType,     80);
  const tireSize       = sanitize(b.tireSize,        30);
  const tireName       = sanitize(b.tireName,       100);
  const notes          = sanitize(b.notes,          500);
  const date           = sanitize(b.date,            10);
  const time           = sanitize(b.time,            10);
  const inventorySource = sanitize(b.inventorySource, 20) === 'trial' ? 'trial' : 'store';
  const email          = sanitizeEmail(b.email);

  if (!name)  return res.status(400).json({ error: 'Customer name is required.' });
  if (!email) return res.status(400).json({ error: 'Valid email address is required.' });

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format.' });
  }

  // Validate qty — must be 1–8 tires
  const qty = Math.max(1, Math.min(8, parseInt(b.qty, 10) || 4));

  // Validate subtotal/gst/total are numbers (can't trust client-sent prices)
  const subtotal = parseFloat(b.subtotal) || 0;
  const gst      = parseFloat(b.gst)      || 0;
  const total    = parseFloat(b.total)    || 0;
  if (subtotal < 0 || subtotal > 100_000) {
    return res.status(400).json({ error: 'Invalid subtotal.' });
  }

  let serviceAccountCreds;
  try {
    serviceAccountCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    console.error('book POST: invalid GOOGLE_SERVICE_ACCOUNT_KEY');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountCreds,
      scopes:      ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // Parse "11:00 AM" → 24-hour
    const timeParts = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!timeParts) return res.status(400).json({ error: 'Invalid time format. Use HH:MM AM/PM.' });

    let hour      = parseInt(timeParts[1], 10);
    const min     = parseInt(timeParts[2], 10);
    const ampm    = timeParts[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    if (hour < 0 || hour > 23 || min < 0 || min > 59) {
      return res.status(400).json({ error: 'Invalid time value.' });
    }
    const h24 = `${hour < 10 ? '0' : ''}${hour}:${min < 10 ? '0' : ''}${min}`;

    // Reject bookings in the past (server-side guard — primary check is on the frontend)
    const nowEdmonton  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
    const slotEdmonton = new Date(`${date}T${h24}:00`);
    if (slotEdmonton < nowEdmonton) {
      return res.status(400).json({ error: 'Cannot book a time slot that is in the past.' });
    }

    const startDateTime  = `${date}T${h24}:00`;
    const durationMins   = qty * 30;
    const endDate        = new Date(`${date}T${h24}:00`);
    endDate.setMinutes(endDate.getMinutes() + durationMins);
    const endDateTime    = endDate.toISOString().slice(0, 19);

    const addons = [];
    if (b.tpms)     addons.push(`TPMS Sensors ($${qty * 75})`);
    if (b.disposal) addons.push(`Tire Disposal ($${qty * 5})`);

    // Plain-text calendar description — no HTML here
    const description = [
      `Customer: ${name}`,
      `Phone: ${phone}`,
      `Email: ${email}`,
      '',
      `Vehicle: ${vehicleType}`,
      `Tire: ${tireSize} — ${tireName}`,
      `Quantity: ${qty} tires`,
      `Inventory: ${inventorySource === 'trial' ? 'Trial Tires (ordered)' : 'Prince Tires (in-store)'}`,
      '',
      addons.length ? `Add-ons: ${addons.join(', ')}` : 'Add-ons: None',
      `Subtotal: $${subtotal.toFixed(2)}`,
      `GST (5%): $${gst.toFixed(2)}`,
      `Total (incl. GST): $${total.toFixed(2)}`,
      '',
      notes ? `Notes: ${notes}` : '',
      '',
      'Booked via princetires.ca',
    ].filter(Boolean).join('\n');

    const summary = `🛞 Installation — ${name} — ${tireSize} × ${qty} — ${vehicleType}`;

    const eventInsert = await calendar.events.insert({
      calendarId:  process.env.GOOGLE_CALENDAR_ID || 'primary',
      requestBody: {
        summary,
        location:    '111 42 Ave SW, Calgary, AB T2G 0G3',
        description,
        colorId:     '6', // Tangerine
        start: { dateTime: startDateTime, timeZone: 'America/Edmonton' },
        end:   { dateTime: endDateTime,   timeZone: 'America/Edmonton' },
      },
    });
    const eventId = eventInsert?.data?.id || null;

    // ── Confirmation email (HTML-escaped to prevent XSS in email clients) ─────
    if (email && process.env.RESEND_API_KEY) {
      const addonLines = [];
      if (b.tpms)     addonLines.push(`TPMS Sensors: $${qty * 75}`);
      if (b.disposal) addonLines.push(`Tire Disposal: $${qty * 5}`);

      // All user values HTML-escaped before embedding in email HTML
      const eName        = escapeHtml(name);
      const eDate        = escapeHtml(date);
      const eTime        = escapeHtml(time);
      const eTireName    = escapeHtml(tireName);
      const eTireSize    = escapeHtml(tireSize);
      const eVehicleType = escapeHtml(vehicleType || 'Not specified');
      const eTotal       = escapeHtml(total.toFixed(2));
      const eAddonRows   = addonLines.length
        ? `<tr><td style="padding:8px 0;color:#6b7280">Add-ons</td><td style="padding:8px 0">${addonLines.map(escapeHtml).join('<br>')}</td></tr>`
        : '';

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111">
          <div style="background:#dc2626;padding:24px 32px">
            <h1 style="color:#fff;margin:0;font-size:22px">Booking Confirmed</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px">Prince Tires &mdash; Calgary, AB</p>
          </div>
          <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none">
            <p style="font-size:16px;margin:0 0 24px">Hi ${eName}, your installation appointment is confirmed.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px 0;color:#6b7280;width:140px">Date</td><td style="padding:8px 0;font-weight:600">${eDate}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">Time</td><td style="padding:8px 0;font-weight:600">${eTime}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">Tire</td><td style="padding:8px 0">${eTireName} (${eTireSize})</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">Quantity</td><td style="padding:8px 0">${escapeHtml(String(qty))} tires</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">Vehicle</td><td style="padding:8px 0">${eVehicleType}</td></tr>
              ${eAddonRows}
              <tr style="border-top:1px solid #e5e7eb">
                <td style="padding:12px 0 0;font-weight:700">Total</td>
                <td style="padding:12px 0 0;font-weight:700;color:#dc2626">$${eTotal} (incl. GST)</td>
              </tr>
            </table>
            <div style="margin:24px 0;padding:16px;background:#f9fafb;border-radius:8px;font-size:14px">
              <strong>Location</strong><br>
              111 42 Ave SW, Calgary, AB T2G 0G3<br>
              <span style="color:#6b7280">Please arrive 5 minutes early. Bring your existing tires if storing with us.</span>
            </div>
            <p style="font-size:13px;color:#9ca3af;margin:0">Need to change your appointment? Reply to this email or call us.</p>
            ${eventId ? (() => {
              let cToken = '';
              try { cToken = generateCancelToken(eventId); } catch {}
              return cToken
                ? `<p style="font-size:13px;color:#9ca3af;margin:12px 0 0">To cancel this appointment: <a href="https://prince-tires-booking.vercel.app/api/cancel?id=${encodeURIComponent(eventId)}&token=${encodeURIComponent(cToken)}" style="color:#dc2626">Cancel booking</a></p>`
                : '';
            })() : ''}
          </div>
        </div>`;

      // Fire-and-forget — do not block the booking confirmation response
      fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'Prince Tires <bookings@princetires.ca>',
          to:      email,
          subject: `Booking confirmed — ${date} at ${time}`,
          html:    emailHtml,
        }),
      }).catch(err => console.error('Resend email error:', err));

      // Owner notification — always send regardless of customer email
      const ownerHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111">
          <div style="background:#111;padding:20px 28px">
            <h1 style="color:#fff;margin:0;font-size:20px">📅 New booking</h1>
            <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">${escapeHtml(date)} at ${escapeHtml(time)}</p>
          </div>
          <div style="padding:28px;background:#fff;border:1px solid #e5e7eb;border-top:none">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:7px 0;color:#6b7280;width:130px">Customer</td><td style="padding:7px 0;font-weight:600">${eName}</td></tr>
              <tr><td style="padding:7px 0;color:#6b7280">Phone</td><td style="padding:7px 0">${escapeHtml(phone)}</td></tr>
              <tr><td style="padding:7px 0;color:#6b7280">Email</td><td style="padding:7px 0">${escapeHtml(email)}</td></tr>
              <tr><td style="padding:7px 0;color:#6b7280">Date &amp; time</td><td style="padding:7px 0;font-weight:600">${eDate} at ${eTime}</td></tr>
              <tr><td style="padding:7px 0;color:#6b7280">Tire</td><td style="padding:7px 0">${eTireName} (${eTireSize}) &times; ${escapeHtml(String(qty))}</td></tr>
              <tr><td style="padding:7px 0;color:#6b7280">Vehicle</td><td style="padding:7px 0">${eVehicleType}</td></tr>
              <tr><td style="padding:7px 0;color:#6b7280">Inventory</td><td style="padding:7px 0">${inventorySource === 'trial' ? '⚠️ Trial Tires (ordered)' : 'Prince Tires (in-store)'}</td></tr>
              ${eAddonRows}
              <tr style="border-top:1px solid #e5e7eb">
                <td style="padding:10px 0 0;font-weight:700">Total</td>
                <td style="padding:10px 0 0;font-weight:700;color:#16a34a">$${eTotal} (incl. GST)</td>
              </tr>
            </table>
            ${notes ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:6px;font-size:13px"><strong>Notes:</strong> ${escapeHtml(notes)}</div>` : ''}
          </div>
        </div>`;

      fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'Prince Tires Bookings <bookings@princetires.ca>',
          to:      'princetires111@gmail.com',
          subject: `New booking — ${name} — ${date} at ${time}`,
          html:    ownerHtml,
        }),
      }).catch(err => console.error('Owner notification email error:', err));
    }

    // Generate a lookup token so the customer can retrieve their bookings (A01 fix)
    let lookupToken = null;
    try {
      lookupToken = generateLookupToken(email);
    } catch (err) {
      console.error('lookupToken generation failed (BOOKING_LOOKUP_SECRET missing?):', err.message);
    }

    // Generate a cancel token tied to this specific calendar event
    let cancelToken = null;
    if (eventId) {
      try {
        cancelToken = generateCancelToken(eventId);
      } catch (err) {
        console.error('cancelToken generation failed:', err.message);
      }
    }

    return res.status(200).json({ success: true, lookupToken, eventId, cancelToken });
  } catch (error) {
    console.error('Google Calendar booking error:', error);
    return res.status(500).json({ error: 'Failed to create booking. Please try again.' });
  }
}

// ── Route dispatcher ──────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, POST, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET')     return handleGet(req, res);
  if (req.method === 'POST')    return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};
