/**
 * Cloudflare Worker — Gemini API proxy for Prince Tires chatbot
 *
 * Deploy this at: https://workers.cloudflare.com
 * Set environment variable: GEMINI_API_KEY = your Google AI Studio key
 *
 * Steps:
 *   1. Go to https://workers.cloudflare.com and create a new Worker
 *   2. Paste this entire file into the editor
 *   3. Go to Settings > Variables > add GEMINI_API_KEY = your key
 *   4. Click Deploy, copy the Worker URL (e.g. https://my-worker.username.workers.dev)
 *   5. Paste that URL into the Shopify theme editor > AI Chatbot section > "Gemini API endpoint URL"
 */

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Optional: restrict which origins can call this Worker
const ALLOWED_ORIGINS = [
  // 'https://your-store.myshopify.com',
  // 'https://www.princetires.ca',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin);
    }

    // Optional origin check — uncomment ALLOWED_ORIGINS above to enable
    if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
      return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400, origin);
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return corsResponse(JSON.stringify({ error: 'API key not configured' }), 500, origin);
    }

    try {
      const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await geminiRes.json();

      if (!geminiRes.ok) {
        return corsResponse(JSON.stringify({ error: data?.error?.message || 'Gemini error' }), geminiRes.status, origin);
      }

      return corsResponse(JSON.stringify(data), 200, origin);
    } catch (err) {
      return corsResponse(JSON.stringify({ error: 'Upstream fetch failed' }), 502, origin);
    }
  },
};

function corsResponse(body, status, origin) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  return new Response(body, { status, headers });
}
