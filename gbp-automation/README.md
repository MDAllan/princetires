# GBP Automation — Prince Tires

Zero-touch Google Business Profile automation:
- **Auto-replies to reviews** — natural, Calgary-local, no emojis, routes 1–3★ to a phone call. Skips reviews already replied to.
- **Weekly auto-posts** — publishes the next item from `data/posts.json`, tracks state so each posts once.

Free to run: the GBP API has no usage cost, and this runs on the existing droplet.

## Stack
Node 18+, one dependency (`dotenv`). Talks to the GBP REST APIs directly:
- Account/location discovery: `mybusinessaccountmanagement` + `mybusinessbusinessinformation` v1
- Posts & review replies: legacy `mybusiness` v4

## Setup (once)
```bash
cd gbp-automation
npm install
cp .env.example .env        # then fill in the 3 secrets
node resolve-ids.mjs        # prints GBP_V4_PARENT -> paste it into .env
```
`.env` needs: `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` (from the OAuth Playground), `GBP_V4_PARENT`.

## Test safely first (posts/replies nothing)
```bash
npm run reply:dry          # shows the reply it would leave on each un-answered review
npm run post:dry           # shows the next post it would publish
```
Review the output, then go live:
```bash
npm run post               # publishes ONE post (the next in the queue)
npm run reply              # replies to all un-answered reviews
```

## Schedule (cron on the droplet)
```cron
# Weekly post — Tuesdays 10:00
0 10 * * 2  cd /home/ubuntu/gbp-automation && /usr/bin/node post-weekly.mjs >> post.log 2>&1
# Daily review sweep — 9:00
0 9 * * *   cd /home/ubuntu/gbp-automation && /usr/bin/node reply-to-reviews.mjs >> reply.log 2>&1
```

## Refilling content
- `data/posts.json` — add more posts (Claude generates the next batch each quarter). `state/posted.json` tracks what's gone out.
- `data/replies.json` — the reply templates. Edit anytime; keep them natural and in-scope (tires + wheels; only re-torque is free).

## Safety notes
- Secrets live only in `.env` on the droplet (gitignored) — never in code or git.
- Review replies skip anything already answered, so re-running is safe.
- Start with the `:dry` scripts after any change.
