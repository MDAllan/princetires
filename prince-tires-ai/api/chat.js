import knowledge from '../knowledge.js';
import {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  sanitize,
  sanitizeForPrompt,
} from './_lib/security.js';

// A05: no hardcoded secrets or URLs — all from env vars
const SHEETS_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(200).end();

  // Rate limit: 20 chat requests per minute per IP
  if (!rateLimit(req, res, 20, 60_000)) return;

  const { messages, product: p } = req.body || {};

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  // A03: sanitize all product fields before injecting into the AI system prompt.
  // These come from the client and could carry prompt-injection payloads.
  const title          = sanitizeForPrompt(p?.title,           80);
  const vendor         = sanitizeForPrompt(p?.vendor,          40);
  const size           = sanitizeForPrompt(p?.size,            20);
  const season         = sanitizeForPrompt(p?.season,          30);
  const bestFor        = sanitizeForPrompt(p?.best_for,       100);
  const notRecommended = sanitizeForPrompt(p?.not_recommended, 100);
  const description    = sanitizeForPrompt(p?.description,    300);
  const warrantyKm     = sanitize(String(p?.warranty_km ?? ''), 20);
  const speedRating    = sanitize(String(p?.speed_rating ?? ''), 10);
  const loadIndex      = sanitize(String(p?.load_index  ?? ''), 10);
  const price          = parseFloat(p?.price);
  const available      = Boolean(p?.available);
  const threePeak      = Boolean(p?.three_peak);

  const systemPrompt = `IMPORTANT RULES — ALWAYS FOLLOW:
- Reply in 1-2 sentences MAX. Never more.
- Never explain your process, what data you have, or ask the customer to go look things up.
- Just answer the question directly. If you can't, say so briefly.

${knowledge}

## CURRENT PRODUCT THE CUSTOMER IS ASKING ABOUT
- Name: ${title || 'Unknown'}
- Brand: ${vendor || 'Unknown'}
- Size: ${size || 'Unknown'}
- Season: ${season || 'Unknown'}
- Price: $${isNaN(price) ? 'N/A' : price.toFixed(2)} per tire
- In stock: ${available ? 'Yes' : 'No'}
- Warranty: ${warrantyKm ? warrantyKm + ' km' : 'See product page'}
- Speed rating: ${speedRating || 'N/A'}
- Load index: ${loadIndex || 'N/A'}
- 3-Peak Mountain Snowflake: ${threePeak ? 'Yes' : 'No'}
- Best for: ${bestFor || 'General use'}
- Not recommended for: ${notRecommended || 'N/A'}
- Description: ${description || ''}`;

  // Sanitize and limit message history — max 20 turns, each message max 500 chars
  const contents = messages
    .slice(-20)
    .map(msg => ({
      role:  msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: sanitize(String(msg.content || ''), 500) }],
    }));

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: '' }] });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('chat.js: GEMINI_API_KEY not set');
    return res.status(500).json({ reply: 'Service temporarily unavailable.' });
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      },
    );

    if (!geminiRes.ok) {
      // A09: log details server-side, return generic message to client
      console.error('chat.js: Gemini API error', geminiRes.status);
      return res.status(500).json({ reply: 'Unable to process your question right now.' });
    }

    const data  = await geminiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      console.error('chat.js: empty Gemini response', JSON.stringify(data));
      return res.status(500).json({ reply: 'Unable to process your question right now.' });
    }

    // Log to Google Sheets (fire-and-forget — only if env var is configured)
    if (SHEETS_URL) {
      const lastUserMsg = messages
        .filter(m => m.role === 'user')
        .slice(-1)[0]?.content || '';

      fetch(SHEETS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          product:  title || 'Unknown',
          question: sanitize(lastUserMsg, 500),
          answer:   sanitize(reply, 500),
        }),
      }).catch(err => console.error('Sheets logging error:', err));
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('chat.js: unexpected error:', err);
    return res.status(500).json({ reply: 'Unable to process your question right now.' });
  }
}
