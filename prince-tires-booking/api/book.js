const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let b = req.body;
  // Vercel sometimes delivers body as a string — parse it explicitly
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch (e) { b = null; }
  }
  if (!b || !b.name || !b.date || !b.time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Parse "11:00 AM" format to 24h
    const timeParts = b.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
    let hour = parseInt(timeParts[1]);
    const min = parseInt(timeParts[2]);
    const ampm = timeParts[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    const h24 = `${hour < 10 ? '0' : ''}${hour}:${min < 10 ? '0' : ''}${min}`;

    const startDateTime = `${b.date}T${h24}:00`;
    const qty = b.qty || 4;
    const durationMins = qty * 30;
    const endDate = new Date(`${b.date}T${h24}:00`);
    endDate.setMinutes(endDate.getMinutes() + durationMins);
    const endDateTime = endDate.toISOString().slice(0, 19);

    const addons = [];
    if (b.tpms) addons.push(`TPMS Sensors ($${qty * 75})`);
    if (b.disposal) addons.push(`Tire Disposal ($${qty * 5})`);

    const description = [
      `Customer: ${b.name}`,
      `Phone: ${b.phone}`,
      `Email: ${b.email}`,
      '',
      `Vehicle: ${b.vehicleType}`,
      `Tire: ${b.tireSize} — ${b.tireName}`,
      `Quantity: ${qty} tires`,
      '',
      addons.length ? `Add-ons: ${addons.join(', ')}` : 'Add-ons: None',
      `Subtotal: $${(b.subtotal || 0).toFixed(2)}`,
      `GST (5%): $${(b.gst || 0).toFixed(2)}`,
      `Total (incl. GST): $${(b.total || 0).toFixed(2)}`,
      '',
      b.notes ? `Notes: ${b.notes}` : '',
      '',
      'Booked via princetires.ca',
    ].filter(Boolean).join('\n');

    const summary = `🛞 Installation — ${b.name} — ${b.tireSize} × ${qty} — ${b.vehicleType}`;

    await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      requestBody: {
        summary,
        location: '111 42 Ave SW, Calgary, AB T2G 0G3',
        description,
        start: { dateTime: startDateTime, timeZone: 'America/Edmonton' },
        end: { dateTime: endDateTime, timeZone: 'America/Edmonton' },
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Google Calendar error:', error);
    return res.status(500).json({ error: 'Failed to create calendar event' });
  }
};
