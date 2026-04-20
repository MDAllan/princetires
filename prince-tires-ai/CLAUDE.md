# Prince Tires AI Chat

Use the `prince-tires-domain` skill at the start of any session in this repo.

## Quick facts

- **Runtime:** ESM Node.js (Vercel serverless)
- **AI model:** Gemini (via `GEMINI_API_KEY` env var)
- **Deploy:** `cd c:\Users\madih\prince-tires-ai && vercel --prod`

## Architecture

```
api/chat.js          — Vercel function, handles POST /api/chat
knowledge.js         — Exports all KB joined as one string
kb/data/             — Individual KB modules (ESM default exports)
```

## KB modules (all wired into knowledge.js)

| File | Content |
|------|---------|
| `seasonal.js` | 7°C rule, Alberta swap timing |
| `faqs.js` | 20 customer Q&As |
| `brands.js` | Brand profiles + price tiers |
| `services.js` | Installation, TPMS, balancing, disposal |
| `policies.js` | Returns, warranty, payment |
| `guides.js` | Tire size, UTQG, 3PMSF, speed rating |
| `vehicles.js` | 30+ vehicles with OEM tire sizes |

## Adding KB content

1. Edit or add a file in `kb/data/`
2. Export a plain string as `default`
3. Import and add to the array in `knowledge.js`
4. Deploy

## Seasonal triggers (not yet implemented)

Planned: inject seasonal urgency into system prompt during Oct–Nov (winter swap) and Mar–Apr (summer swap).
