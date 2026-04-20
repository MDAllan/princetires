import {
  setCorsHeaders,
  setSecurityHeaders,
  rateLimit,
  sanitize,
} from './_lib/security.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS');
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(200).end();

  // Rate limit: 30 vehicle lookups per minute per IP
  if (!rateLimit(req, res, 30, 60_000)) return;

  const rawQuery = req.body?.query;
  if (!rawQuery) return res.status(400).json({ error: 'No query.' });

  // A03: sanitize input before use in prompt — strip control chars, limit length
  const query = sanitize(rawQuery, 100);
  if (!query) return res.status(400).json({ error: 'Invalid query.' });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('vehicle.js: GEMINI_API_KEY not set');
    return res.status(500).json({ year: null, make: null, model: null, trim: null });
  }

  // A03: Prompt injection mitigation — the user query is placed in a clearly
  // delimited data section separate from instructions, so the model treats it
  // as data rather than a command.  Input is also pre-sanitized above.
  const instructionPart = `Extract vehicle info from a customer search query.

Return ONLY a JSON object with these fields:
- year (number, 4 digits, guess most recent if not specified)
- make (string, full brand name e.g. "Honda" not "honda")
- model (string, official model name)
- trim (string or null)

Examples:
"2020 Honda Civic" -> {"year":2020,"make":"Honda","model":"Civic","trim":null}
"'19 Civic" -> {"year":2019,"make":"Honda","model":"Civic","trim":null}
"F-150" -> {"year":2025,"make":"Ford","model":"F-150","trim":null}
"corolla le" -> {"year":2025,"make":"Toyota","model":"Corolla","trim":"LE"}

If the input is not a vehicle, return {"year":null,"make":null,"model":null,"trim":null}

Return ONLY the JSON, no markdown, no explanation.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          system_instruction: { parts: [{ text: instructionPart }] },
          contents: [{
            parts: [{ text: query }],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 100 },
        }),
      },
    );

    if (!geminiRes.ok) {
      console.error('vehicle.js: Gemini API error', geminiRes.status);
      return res.status(200).json({ year: null, make: null, model: null, trim: null });
    }

    const data    = await geminiRes.json();
    const text    = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();

    try {
      const vehicle = JSON.parse(jsonStr);
      // Validate shape before returning
      return res.status(200).json({
        year:  typeof vehicle.year  === 'number' ? vehicle.year  : null,
        make:  typeof vehicle.make  === 'string' ? vehicle.make  : null,
        model: typeof vehicle.model === 'string' ? vehicle.model : null,
        trim:  typeof vehicle.trim  === 'string' ? vehicle.trim  : null,
      });
    } catch {
      return res.status(200).json({ year: null, make: null, model: null, trim: null });
    }
  } catch (err) {
    console.error('vehicle.js: unexpected error:', err);
    return res.status(200).json({ year: null, make: null, model: null, trim: null });
  }
}
