# GBP Automation (Level 2 — Zero-Touch Custom Build)

**Goal:** Fully automated Google Business Profile management on Prince Tires' own infra — weekly auto-posts + auto-replies to customer reviews, zero ongoing human effort.

**Host:** tools.princetires.ca droplet (DO Toronto, 147.182.152.113 / Reserved 209.38.1.227).

**Prereqs (met):** verified GBP active 60+ days (est. 2022) ✓ · live website princetires.ca ✓.

---

## Architecture
```
cron (droplet)
  ├─ weekly: generate post (content + image) → POST localPosts → GBP
  └─ daily:  list new reviews → match reply from bank → updateReply → GBP
auth: OAuth2 refresh token (offline) → access token per run
```
API: `mybusiness.googleapis.com/v4` · scope `https://www.googleapis.com/auth/business.manage`

---

## Setup phases & status

### Phase 1 — Google API access  ✅ DONE
- [x] **APPROVED 2026-04-20** (ticket 2-3985000040774, account princetires111@gmail.com). Skip the wait.
- [ ] Confirm WHICH GCP project was approved (need project ID for OAuth creds)

### Phase 2 — OAuth credentials  ✅ DONE
- [x] Project `prince-tires-reviews`; enabled Google My Business API + Account Management API (+ Business Information already on)
- [x] OAuth consent screen published to **In production** (External) — refresh token won't expire
- [x] OAuth **Web application** client created (redirect URI = OAuth Playground)
- [x] Refresh token minted via OAuth Playground (scope business.manage) — user holds CLIENT_ID/SECRET/REFRESH_TOKEN

### Phase 3 — Build  ✅ DONE — deployed via **Vercel** (in `princetires-app`, not the droplet)
Decision: droplet has no SSH access from this machine; the app is already on Vercel Pro with an `api/cron/` convention, so the automation rides that.
- [x] `src/lib/gbp/auth.ts` refresh→access token
- [x] `src/lib/gbp/client.ts` API wrappers + `getV4Parent` (auto-detects single location → only 3 env vars needed)
- [x] `src/lib/gbp/replies.ts` (keyword/star matcher, skips replied)
- [x] `src/lib/gbp/posts.ts` (deterministic weekly rotation, no state store)
- [x] `src/app/api/cron/gbp-reply/route.ts` (daily, batches 25/run, CRON_SECRET auth)
- [x] `src/app/api/cron/gbp-post/route.ts` (weekly Tue)
- [x] `vercel.json` crons added (`0 15 * * *` reply, `0 16 * * 2` post)
- [x] Verified: `tsc --noEmit` clean, matches Next 16 route conventions, reply logic unit-tested
- _(Standalone Node version in `gbp-automation/` kept as an optional laptop-run backfill tool.)_

### Phase 4 — Deploy & verify  ⬅️ ONLY THING LEFT
- [ ] **You:** add 3 env vars in Vercel (Production): `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN`
- [ ] Deploy: push these files → Vercel auto-builds (confirm before pushing to the live app)
- [ ] Verify: manually run `/api/cron/gbp-post` + `/api/cron/gbp-reply` once, confirm on the GBP listing
- [ ] Crons then run automatically (reply daily, post weekly); the ~560-review backlog clears ~25/day

---

## What I need from the user
- Project Number (after Phase 1 step 1)
- A green light at Phase 2 for the one-time OAuth consent

## Safeguards
- Dry-run mode first (logs what it *would* post, posts nothing)
- Review auto-reply skips reviews already replied to; routes negative reviews to a phone-call reply (no defensive text)
- Stays in factual scope (tires + wheels; only re-torque free)
