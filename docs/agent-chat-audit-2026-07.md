# AI Agent + Chat Widget Audit — July 2026

Multi-agent audit (85 agents: 6 investigators over real transcripts + code, adversarial verification of every finding, synthesis). 56 findings confirmed, 22 refuted. Transcript window: all-time web chats + 30-day SMS (100 conversations).

## Overall assessment

The agent's happy path is genuinely good (instant size-filtered links, VIN photo decode, correct winter advice, a rebooking chat that earned two 'Loved' reactions), and the anti-hallucination plumbing (URL firewall, tool-grounded links) is sound. The owner's four complaints trace to a small number of concrete, evidenced mechanisms, most of them operational rather than model-quality. (1) FACTUAL MISTAKES: the model invents weekday/date pairs because booking/availability tools return bare ISO dates with no weekday (a real wrong-day booking, Chat 91); fmtPrice() omits 5 of 8 vehicle-class install prices from the prompt so the model guesses between anchors ($25 vs $35 SUV quotes on the same day — real price is $30); the NE shop has no address/hours in the prompt; and the wheel-size.com API key is failing auth RIGHT NOW, so all fitment lookups return 'vehicle not found'. (2) NOT NATURAL: the prompt's own example sentence is parroted verbatim in 20+ chats; hardcoded 'Thanks! A team member will follow up' repeated 3x to direct questions on web; 480-char blind slice cutting replies mid-word and mid-URL; SMS copy ('thanks for texting') leaking into web chat; and the RingCentral-native missed-call auto-text firing into live threads (triple-send provoked 'Fk u') then being misclassified as a human reply that permanently silences the bot. (3) NOT HELPFUL: this is the biggest revenue leak — 66/100 chats escalate and 31 strand, several with the customer's last message being a name, email, or a booking time; escalation is one L1+L2 page with no re-page, no ack-on-reply (guaranteeing false L2 alarms), a permanent humanEngaged latch after any manual reply, and pure silence to the customer by design; price questions get a raw filter URL instead of prices. (4) WRONG TIRE: the recommendation tool ranks only the 8 cheapest SKUs in 'best-rated' mode, its tool output carries no season/construction/speed-rating/quantity data (ST trailer tires interleave with passenger tires invisibly; studded winters can surface in July), season/brand filters are case-sensitive (lowercase 'winter' = false 'we don't stock it'), useToSeason substring-matches 'ice' in 'price' and 'at' in 'weather', and staggered rear sizes are silently discarded. GROWTH: web chat (~1.3 chats/day, not 3/month — the 3 was a sampling artifact, but still tiny) is CSS-unreachable on product pages on both desktop and most mobile, has no proactive teaser, kills 3.4MB+ phone photos on Vercel's 4.5MB limit, wipes the visible transcript on navigation, and permanently bricks input at a lifetime 25-message cap. The plan below front-loads cheap prompt/data fixes that kill the recurring factual errors, then treats escalation lifecycle and recommendation grounding as the two flagship projects.

## Quick wins (each < half a day)

### 1. Fix the dead wheel-size.com API key (fitment lookups are failing for everyone right now)

**Complaint:** not helpful + makes mistakes

**Root cause:** WHEEL_SIZE_API_KEY gets 'Authentication failed' from api.wheel-size.com as of Jul 4; /api/wheel-fitment returns vehicle:null even for a 2012 Honda Civic, so the agent tells customers with mainstream vehicles (2023 Bronco Sport, 2021 GLC 43) 'I'm not finding that vehicle — double check the year/make/model'. The same key powers the PDP 'Fits N vehicles' badge, the rim visualizer, and the storefront wheels tab.

**Change:** Rotate/renew the key with wheel-size.com (check quota/billing), update the env var in Vercel + .env.local, and add a synthetic daily check (known-good vehicle) that emails/pages the owner when the fitment API starts returning auth failures or vehicle:null for a control query.

**Files:** `princetires-app/.env.local`, `princetires-app/src/app/api/wheel-fitment/route.ts`

**Verify by:** curl app.princetires.ca/api/wheel-fitment for '2012 Honda Civic' and '2023 Ford Bronco Sport' returns real tire sizes (not vehicle:null); PDP 'Fits N vehicles' badge renders again; synthetic check passes daily.

### 2. Enumerate all 8 vehicle-class install prices in the prompt (fmtPrice fix)

**Complaint:** makes mistakes

**Root cause:** A canonical per-vehicle price table exists in Neon and is injected as 'SOURCE OF TRUTH', but fmtPrice() compresses it to '$25-$45/tire (passenger $25, truck $35, dually $45...)' — SUV/van/electric/largetruck prices are omitted, so the model interpolates. Result: SUV install quoted $25 to one customer and $35 to another on the same day (Chat 91 vs 85); the real DB price is $30, so BOTH were wrong.

**Change:** Rewrite fmtPrice() in config.ts to render every vehicle class with its exact price for each service (or add a get_service_price tool). Add a prompt rule: when a customer cites a differing prior quote, escalate with the discrepancy flagged instead of overriding it (Chat 73 re-quoted a customer $20 higher unilaterally).

**Files:** `princetires-app/src/lib/sms/config.ts`, `princetires-app/src/lib/sms/agent.ts`

**Verify by:** Regression script: ask the agent the SUV/van/electric/truck install price 10 phrasings each; every reply must match the services table exactly ($30 SUV). Grep the rendered system prompt to confirm all 8 classes appear.

### 3. Deterministic weekday labels on every booking/availability tool result

**Complaint:** makes mistakes

**Root cause:** checkAvailability returns a bare ISO date and bookAppointment returns 'when' with no weekday, so the model does its own calendar math and fails despite the injected current date: it asserted 'Today is Friday, June 27' (Jun 26 was Friday) and booked a customer on Saturday who wanted same-day (Chat 91); confirmed 'Thursday, June 26th' — an impossible pair — to Kathleen (Chat 84); offered a Monday slot labeled 'Sun, Jun 29' (Chat 75). A dateLabel() helper already exists in agent.ts but is only used for web buttons.

**Change:** Append dateLabel(date) (weekday + date + 'today'/'tomorrow' when applicable) to check_availability and book_appointment tool results, plus business hours for that weekday and total open-slot count (so the model stops presenting the slice(0,8) cap as 'open 9:30-1:00'). Add a server-side consistency check: if the booked date's weekday differs from what the model wrote, or the customer's message matches /wrong day|not (satur|sun|mon)|I booked for/, auto-flag for human review.

**Files:** `princetires-app/src/lib/sms/tools.ts`, `princetires-app/src/lib/sms/agent.ts`

**Verify by:** Replay Chat 91: correct the agent with 'It's Friday not Thursday' on a Friday — the reply must keep the correct date number. Book 'tomorrow' near midnight and on Sundays; confirmation weekday must match Google Calendar. Unit test dateLabel against Jun 25-28, 2026.

### 4. Staff hand-reply auto-acks the escalation (kill false L2 pages)

**Complaint:** not helpful (feeds the stranded count via alarm fatigue)

**Root cause:** handleOwnerReply stands the bot down on a manual RingCentral reply but never calls ackEscalation — that only happens via a separate 'TAKE <phone>' text staff never send. So even instantly-handled escalations fire a false '⏫ no response in 5+ min' L2 page to Mohamad, teaching staff that pages are noise. The web-channel reply path already acks on reply, proving the pattern.

**Change:** In handleOwnerReply, call ackEscalation(to) when a staff outbound to that customer is detected. Keep TAKE as the explicit shortcut for phone-call-handled cases.

**Files:** `princetires-app/src/app/api/sms/inbound/route.ts`, `princetires-app/src/lib/sms/escalations.ts`

**Verify by:** Trigger a test escalation, reply by hand from RingCentral without texting TAKE, wait 6+ minutes and send another inbound: no L2 page fires and the sms_escalations row shows acked_at set.

### 5. Missed-call text-back: disable the RC-native auto-text, widen app suppression, stop it hijacking threads

**Complaint:** not natural + not helpful

**Root cause:** TWO templates from TWO systems fire into live threads. The short one that triple-sent and provoked 'Fk u' (Chat 34) is RingCentral-native — it exists nowhere in the codebase and no app fix can stop it; worse, it arrives at the SMS webhook as an outbound the app didn't send, and handleOwnerReply misclassifies it as a human reply, flipping the thread to state=human and permanently silencing the bot. The app's own template has 30-min suppression/idempotency windows that are too short (it interrupted a mid-booking customer 31+ min after her last text, Chat 15), and claimOnce fails OPEN on Redis errors.

**Change:** (a) Disable the RingCentral-portal missed-call auto-text (config change). (b) In the app path: lengthen thread-activity suppression to 24-48h (send a contextual 'saw you called — still about those tires?' instead of the cold template), lengthen per-caller idempotency to hours, and make claimOnce fail closed (or add a DB fallback) for this path. (c) Belt-and-suspenders: teach handleOwnerReply to recognize and ignore known auto-template bodies so they can never latch state=human.

**Files:** `princetires-app/src/app/api/calls/inbound/route.ts`, `princetires-app/src/lib/redis.ts`, `princetires-app/src/app/api/sms/inbound/route.ts`

**Verify by:** Call the shop from a number with an active thread 45 min after last text: no cold template, contextual line instead. Call twice 40 min apart: one send. Confirm in the DB that no missed-call event flips a thread to state=human.

### 6. Recommendation filter normalization: season casing, brand fuzzy-match, useToSeason word boundaries

**Complaint:** wrong tire + makes mistakes

**Root cause:** Three verified filter bugs in recommend.ts: (1) season is validated case-insensitively but passed to the Shopify metafield filter raw — live test: 'Winter' = 9 products, 'winter' = 0, so a lowercase season makes the agent falsely say the size isn't stocked (and caches the empty result 15 min); (2) brand is exact-match on vendor casing/spacing — 'kumho' = 0, 'BF Goodrich' = 0 (store vendor 'BFGoodrich') → false 'we don't carry that brand'; (3) useToSeason substring-matches: 'best price'/'nice and quiet' → Winter ('ice' in price/nice), 'all-weather'/'great tires' → All-Terrain ('at' in weather/great), and the 'performance perf' alternation is a typo.

**Change:** Canonicalize season to the exact stored strings before filtering ('winter'→'Winter', 'all season'→'All-Season'); normalize brand against a cached, paginated vendor list (strip case/spaces/punctuation, fall back to no-brand + note when unmatched); fix useToSeason with \b word boundaries, fix the typo, test all-weather BEFORE all-terrain, drop bare 'truck'. Add a unit test file covering the exact broken phrases.

**Files:** `princetires-app/src/lib/sms/recommend.ts`

**Verify by:** Unit tests: useToSeason('best price')===null, ('all-weather')==='All-Weather'. Live: recommend_tires with season='winter' and brand='kumho' on 205/55R16 returns products. Ask the agent 'do you have kumho winter tires in 205/55r16' — it must not claim the brand/size isn't stocked.

### 7. Never pure silence to the customer on SMS escalation — send a minimal ack

**Complaint:** not helpful

**Root cause:** no_reply(alert_staff=true) on SMS sends nothing by design while flipping state to human — a customer who texts an e-transfer confirmation ('Paid', Chat 89) gets zero response ever if staff miss the two pages. The web channel already sends 'Thanks! A team member will follow up with you shortly.' on the same path, proving the pattern is safe.

**Change:** In the SMS inbound route's noReply+escalate branch, send a deterministic one-liner ('Got it — a team member will confirm shortly.') instead of silence. Keep true silence only for alert_staff=false acknowledgments ('ok thanks').

**Files:** `princetires-app/src/app/api/sms/inbound/route.ts`

**Verify by:** Text an e-transfer screenshot caption / 'Paid' from a test number: receive the ack within seconds, and confirm the escalation page still fires to staff.

### 8. NE location facts + channel-correct fallback copy + sentence-boundary truncation

**Complaint:** makes mistakes + not natural

**Root cause:** Three small prompt/copy gaps: (1) the prompt gives the NE shop no address or hours and doesn't label the hours line as SW — transcripts show customers asking 'Do you have an edmonton trail location? / what's the address?' and having to phone the shop; (2) web visitors get SMS copy on failure ('Thanks for texting Prince Tires' / 'they'll text you shortly' — observed live in web chat 32); (3) the 480-char blind slice cut a live SMS mid-URL ('https://princetires.ca/pr' — dead link sent) and a real web reply mid-sentence at exactly 480.

**Change:** (a) Add the canonical NE NAP from pt-nap.liquid (Unit 101, 3928 Edmonton Trail NE, (403) 953-4283) to the LOCATIONS block, label the hours as SW's, keep the no-online-NE-booking rule (owner to confirm real NE hours first — one caller was told 5 PM). (b) Thread channel into REPLY_FALLBACK, the max-rounds fallback, and degradedReply with web variants ('right here in chat, or call (403) 452-4283'). (c) Make MAX_REPLY_CHARS channel-aware (SMS 480, web ~1200) and truncate at the last sentence/newline boundary, reserving room for the attached URL so links are never chopped.

**Files:** `princetires-app/src/lib/sms/agent.ts`, `princetires-app/src/lib/sms/guards.ts`, `princetires-app/src/lib/sms/degraded.ts`

**Verify by:** Ask 'where exactly is your NE shop?' on SMS — correct address, no deflection. Force an empty model reply on web — no 'texting' copy. Unit test: a 600-char reply with trailing URL truncates at a sentence boundary with the URL intact; re-run the Chat 13 four-brand prompt and confirm no mid-URL cut.

## High-impact projects

### 1. Escalation lifecycle overhaul: SLA, bot-resume, un-latch, re-page, digest

**Complaint:** not helpful (the 66% escalation rate and 31/100 stranded conversations — the single biggest revenue leak; customers who gave name, email, size, and a time got permanent silence)

**Root cause:** Escalation is a one-way state with no recovery path: (1) the prompt force-escalates the shop's core intent (buy tires + install) plus a broad catch-all; (2) after state=human, follow-ups are recorded-and-dropped for 45 min and the hand-back only fires when the customer texts AGAIN after 45 min — never on a timer; (3) one manual staff reply sets humanEngaged permanently (no TTL), so a customer who got one hand-reply last month gets silence forever, and the watchdog explicitly excludes state=human so nothing re-pages; (4) the ladder is exactly two SMS pages, closed by paging rather than by the customer being answered, with no digest of open escalations. Alerting itself already exists (L1 page + L2 sweep + admin 'Needs a human' panel) — the gaps are follow-through and recovery.

**Change:** (a) Drive the 45-min stale hand-back from agent-tick (state=human, not humanEngaged, last message from customer) and answer the trailing unanswered text via the existing splitTrailingUser/runAgent machinery; send one throttled 'still on it' ack for mid-window follow-ups. (b) Add a humanEngaged TTL: a NEW inbound arriving >24h after the last staff outbound resets to bot (mirrors what web chat already does at 3 min) — and re-alert staff instead of silently dropping when a latched thread gets a new message; extend the watchdog to human-state threads. (c) Re-page unacked escalations on backoff (+30 min, +2h) and add a daily digest to both managers: 'N customers escalated yesterday and never got a reply: <phones>'. (d) With owner sign-off, narrow the forced buy+install handoff: let the agent complete tire-selection + booking itself (it has the calendar tool) and hand off only payment/negotiation, or at minimum have the resumed bot actually book instead of re-promising a human (Chat 13's loop).

**Files:** `princetires-app/src/lib/sms/escalations.ts`, `princetires-app/src/app/api/sms/inbound/route.ts`, `princetires-app/src/lib/sms/watchdog.ts`, `princetires-app/src/lib/sms/pending.ts`, `princetires-app/src/lib/sms/agent.ts`

**Verify by:** Simulate: escalate a test thread, staff ignore both pages, customer follows up at 10 min ('still on it' ack) and stays silent — at 45+ min agent-tick resumes the bot and answers the trailing message. Text a humanEngaged-latched number 25h after the last staff reply: bot answers. Track the weekly chat-review 'stranded' metric: target <10/100 within a month (from 31).

### 2. Recommendation grounding: construction/season/speed/qty in the tool output + a real 'best-rated' pool

**Complaint:** wrong tire

**Root cause:** Four verified pipeline gaps: (1) the tool sends the model only {brand, model, size, price, score, url} — no ST/LT/P construction (live: 205/75R15 mixes 12 ST trailer tires with a Kumho passenger tire; an F-350 owner's #1 pick in 235/85R16 is an ST trailer tire), no season (unfiltered pools contain studded winters rankable in July; modelFromTitle strips the '(3PMS)'/'(Studded)' markers), no speed/load (dedupe keeps only the cheapest of 91T vs 91H — a literal placard mismatch), no quantity (a 2-in-stock tire recommended to a set-of-4 buyer); (2) 'best-rated' mode slices to the 8 cheapest before rating — live: every rated name brand in 205/55R16 sits at positions 19-30 and is unreachable (real customer pushback in Chat 82: 'what's the next level up from those?'); (3) the Redis cache key omits the vehicle, leaking vehicle-specific 'safe alternate sizes' across customers and letting a cached empty result suppress the fallback; (4) staggered rear sizes are discarded — normalize() reads only wheel.front, so the agent quotes the front size for all four corners.

**Change:** (a) Extend parseTireSize to keep the ST/LT/P prefix; capture speed/load and season tokens in modelFromTitle instead of discarding; add type/season/speedRating/qtyAvailable (via quantityAvailable with the needed Storefront scope, or Admin API) to ProductCard and the tool response so the model can enforce the existing safety rules — partition rather than hard-filter so mixed sizes don't zero out, and annotate ('only 2 left', 'studded winter'). (b) For non-cheapest sorts, widen TiresVote enrichment to ~16-20 candidates spread across the price range (lookups are Redis-cached 30d, so it's cheap). (c) Add year/make/model to the cache key when opts.vehicle is set. (d) Read wheel.rear in wheel-fitment normalize(), emit staggered:true + front/rear pairs (keep them as explicit pairs; bump the cache version), and have the agent quote 2+2. (e) Dedupe on vendor+model+speedRating so distinct ratings survive.

**Files:** `princetires-app/src/lib/sms/recommend.ts`, `princetires-app/src/lib/sms/tools.ts`, `princetires-app/src/lib/sms/agent.ts`, `princetires-app/src/app/api/wheel-fitment/route.ts`

**Verify by:** Unit + live tests: 205/75R15 recommendation labels ST tires and never presents one as a passenger pick (and vice versa); 'best tires in 205/55R16' surfaces rated name brands (Kumho/Falken/Toyo), not Mileking; a July no-season query annotates or excludes studded/winter picks; a Mustang GT lookup returns both front and rear sizes; 91T and 91H variants both appear when asked.

### 3. Give the agent memory of what it just showed (tool-result persistence) + longer history

**Complaint:** makes mistakes + not natural

**Root cause:** functionCall/functionResponse contents exist only inside one runAgent invocation and history is replayed as text-only, so on web the stored turn is just 'Here are 3 well-rated options:' — the actual tires/prices are gone next turn; ordinal follow-ups ('the second one') have nothing to ground on. Separately, the window is history.slice(-14) with no rolling summary — real chats blow past it and Chat 13 shows the predicted symptom (mid-thread re-greeting + a verbatim-repeated answer), violating the prompt's own anti-repetition rules.

**Change:** Store the last recommend_tires payload on the conversation row and inject it into systemText as verified context (NOT as a hidden history line — the poll endpoint and console would leak it — and not framed as 'unverified customer claims'). Raise the window toward ~30-40 messages using the existing 'at' timestamps (timestamp-aware, so weeks-old web turns don't resurface stale dates), or add a server-side rolling summary of evicted turns; keep remember_customer as a supplement, not the mechanism.

**Files:** `princetires-app/src/lib/sms/agent.ts`, `princetires-app/src/lib/sms/conversations.ts`, `princetires-app/src/app/api/chat/route.ts`

**Verify by:** Web test: get 3 recommendation cards, then ask 'what about the second one?' and 'is that first one cheaper than the Michelin?' — answers must name the correct product and exact shown price. Run a 20-message booking+questions chat and confirm no re-greeting or re-asked question.

### 4. Answer price questions with prices (and fix the single link-attach slot + template monotony)

**Complaint:** not helpful + not natural

**Root cause:** This is designed-in, not drift: HARD RULE 271 mandates the URL-only reply and its example sentence is what appears verbatim in 20+ chats ('Here's every tire we carry in [size] with live prices:'); Chat 96's customer had to say 'I can't see how much' before getting numbers. Compounding it: find_tires and find_rims share ONE deterministic link-attach slot, so a tires+rims answer can only ever carry one link (Chat 7's rims link vanished), and a model lead-in with no matched tool call leaves a dangling 'here:' with nothing after it (Chat 63 — customer stranded). The prompt already relaxes 'never quote a price' for recommend_tires, so the concern is stale.

**Change:** With owner sign-off (this reverses an explicit rule): for price-intent messages, call recommend_tires and lead with 2-3 concrete in-stock per-tire prices (cheapest/mid/premium) in the SMS text within the 480-char budget, then append the browse link; retry with looser criteria before ever emitting 'we don't have any specific recommendations'. Support two link-attach slots (tires + rims). Add an SMS-side post-check: a 'here are/here's ... :' lead-in with no attached verified URL forces a rewrite (exempt web turns carrying cards/buttons). Give the size-link reply 4-5 rotating phrasings (the prompt already uses 'VARY the wording' for recommend lead-ins — apply the same technique) and drop exclamation-mark enthusiasm on bad news.

**Files:** `princetires-app/src/lib/sms/agent.ts`

**Verify by:** Replay Chat 96 ('how much 245 60 r20 all weather') — first reply contains 2-3 real prices plus the link. Replay Chat 7 (Micra tires + rims) — both links delivered. Grep a week of new transcripts: the old template sentence appears in <20% of size replies and zero dangling 'here:' endings.

### 5. Web chat revival: reachable entry points, photo uploads that work, sessions that survive

**Complaint:** growth (web is ~1.3 chats/day vs 97% SMS) + not helpful for those who do use it

**Root cause:** Verified compounding blockers: the launcher is CSS-hidden on desktop PDPs AND the tab bar is hidden on mobile PDPs ≤749px, so the product-aware chat is unreachable exactly where it was built to work; there is no proactive teaser and the mobile tab label renders at ~6px; phone photos of 3.4-5MB pass the 5MB client check but die on Vercel's 4.5MB body limit with a connectivity-blaming error (reproduced live: 4.6MB → 413 FUNCTION_PAYLOAD_TOO_LARGE); staff replies after escalation are lost if the visitor navigates (humanMode is in-memory, and the poll re-baselines to empty); the visible transcript wipes on every navigation while the server remembers (uncanny); and the 25-message cap is lifetime per browser with a permanently disabled input ('Per-chat cap' comment is wrong).

**Change:** (a) Un-hide the chat launcher on desktop PDPs and add a chat entry to the mobile PDP sticky bar (or an inline 'Ask about this tire' button using the existing [data-pt-chat-open] hook). (b) Add a dismissible proactive teaser after ~6-10s (localStorage dismissal) + a 'Chat' text label, respecting the launcher's visibility rules. (c) Canvas-downscale images client-side (~1600px long edge, JPEG q0.8) with a pre-send base64-length check, fallback to original on decode failure. (d) Persist humanMode + poll cursor (lastAt) per session in localStorage; on load, sync state from the server and replay messages after the stored cursor; ask for phone/email at escalation time. (e) Rehydrate the rendered transcript from sessionStorage (with a recency cutoff; drop interactive widgets on rehydrate). (f) Scope the message cap per rolling 24h (mirror checkDailyCaps) and re-enable the input after the contact gate.

**Files:** `princetires/snippets/pt-chat-widget.liquid`, `princetires/sections/pt-sticky-book-bar.liquid`, `princetires-app/src/app/api/chat/route.ts`, `princetires-app/src/app/api/chat/poll/route.ts`

**Verify by:** Playwright: chat opens on a desktop PDP and a 375px mobile PDP; a 5MB test photo sends successfully and the VIN decodes; escalate, navigate to another page, post a staff reply from the console, return — the reply renders; send 26 messages across two days — input still works. Track web conversation count: target 5x within a month.

### 6. Fitment robustness: normalization, miss logging, fallback coverage, size-format dead-ends

**Complaint:** not helpful + makes mistakes

**Root cause:** Beyond the dead key (quick win #1): the wheel-fitment route does only trim().toLowerCase() — no space→hyphen slugging, no trim-word stripping ('big bend'), no make aliasing ('mercedes'→'mercedes-benz' exists only in the fallback file); the curated 57-vehicle fallback has no Bronco Sport and zero Mercedes; found:false logs nothing so misses are invisible. Separately, parseTireSize cannot parse '10x16.5'/'10×16.5'/'10-16.5' — the exact formats the bot itself suggests — and the failure note tells the model to re-ask forever (Chat 54's skid-steer customer looped to death with no escalation despite talk_to_human existing).

**Change:** (a) Server-side normalization before the wheel-size call: make aliases, slugging, strip known trim words, retry make+model without trim on a miss. (b) Log every vehicle-not-found tool event to a table surfaced in the weekly chat-review email; seed the fallback with the missed nameplates (Bronco Sport, GLC-Class). (c) Extend parseTireSize for flotation/ST formats (x/×/- separators); when a parsed size genuinely isn't carried (10-16.5 isn't stocked), change the tool note to say-so-once + escalate with a special-order offer instead of re-prompting.

**Files:** `princetires-app/src/app/api/wheel-fitment/route.ts`, `princetires-app/src/lib/sms/fitment-fallback.ts`, `princetires-app/src/lib/sms/tools.ts`

**Verify by:** '2023 bronco sport big bend' and '2021 Mercedes GLC 43' resolve to tire sizes without asking the customer to double-check. Text '10×16.5': one reply acknowledging we don't stock it + special-order escalation, no re-ask loop. Weekly review email lists any new not-found vehicles.

## Nice to have

### 1. Tier-B / winter-rush lead-time gating for agent-booked installs

**Complaint:** makes mistakes (agent held a next-morning 10:30 AM install commitment for supplier-stock tires, Chat 85 — before the 12:30 PM next-day Tier-B floor)

**Change:** The rules exist server-side in /api/book validateBookingRules but agent bookings always post bookType:'service', bypassing them. Have the agent booking pass a real bookType/supplier tier (or derive tier server-side from the tire's inventory source) and add the source-dependent lead times to the prompt, conditioned on buying-from-us so own-tire installs keep the 2h window. Prioritize before Oct 15 (winter rush).

### 2. agent-tick heartbeat monitoring

**Complaint:** not helpful (latent: all timer-driven safety — watchdog, L2 sweeps, delayed replies — hangs on an unmonitored cron-job.org minute-pinger; if it dies, the system silently degrades into exactly the stranded behavior)

**Change:** Write last_tick_at to Redis/Postgres on every tick; have the existing daily Vercel cron alert the owner if it's >10 min stale; optionally register a second independent pinger.

### 3. Harden the (currently inactive) delayed-reply path

**Complaint:** makes mistakes (latent — reply_delay_seconds is 0 in prod, but the toggle is one admin click away)

**Change:** In processPendingReplies: handle result.aiDown with degradedReply + reportAiDown/Up (mirroring the inbound route); in the catch block add pageOwner + a customer fallback SMS alongside the cancel; make TAKE/RELEASE cancel pending replies and add a max-age guard so a stale pending reply can't fire days later after RELEASE.

### 4. Web widget polish: link buttons, animated typing, request timeout

**Complaint:** not natural (raw percent-free but ~135-char filter URLs render verbatim as anchor text and wrap 3-4 lines; static 'typing...' during 8-15s tool-heavy turns)

**Change:** Render a trailing princetires.ca URL as a styled 'Browse all 205/55R16 tires →' button (safe — the appended URL is always firewall-verified); animate the typing indicator; add a ~30s AbortController with a friendly retry (paired with a poll/resume so a completed server reply isn't lost); optionally parallelize the route's pre-checks and, longer-term, stream replies.

### 5. Seasonality re-tagging: 3PMSF all-terrains sold as 'all the all-weather tires we carry'

**Complaint:** wrong tire (Chat 96: four A/T models presented as the complete all-weather set — the bot faithfully reported store data; the products are tagged All-Weather contrary to the team's own db/fill-seasonality.mjs taxonomy)

**Change:** Re-tag A/T-keyword products per the taxonomy AND add explicit cross-category substitution messaging to the prompt ('no true all-weather in this size — these 3PMSF all-terrains are the closest match'), plus forbid completeness claims ('all we carry') from capped recommend_tires output. Do both together — re-tagging alone would regress that size to 'we don't carry any'.

### 6. Scope the photo rules per channel (SMS can't see images)

**Complaint:** makes mistakes (latent: the prompt says both 'READ the photo' and 'no_reply on photos', and SMS MMS bytes are never extracted — the model is told to read images it cannot see; agent.ts even injects '(the customer sent a photo)' for empty MMS)

**Change:** Gate the PHOTO-read rule on isWeb; on SMS, reply 'I can't see photos by text — type the size on the sidewall or use the website chat'; keep payment-screenshot photos under no_reply+alert. Later: wire RingCentral MMS attachment download.

### 7. Unify escalation paging + record dropped web messages

**Complaint:** not helpful (housekeeping)

**Change:** Delete the hardcoded alertOwner in the SMS inbound route in favor of the location-aware pageOwner (matters at NE launch); in the web route, loadOrCreateConversation before the isAgentPaused check and recordTurn the user message in the HOLD branch so 'a team member will follow up' isn't promised on a message no one will ever see; restore a chat opener on the mobile /pages/booking page (only the Book tab needed hiding, not the whole bar).

## Findings refuted during verification (no action needed)

- **Availability tool returns weeks-stale dates: told a June 30 customer "we're all booked up for tomorrow, Sunday, June 7th"** — Refuted with DB-level proof. The cited transcript lines exist, but the reviewer misread the export format of db/pull-web-chats.mjs, which prints only last_message_at in the chat header and dumps the full history without …

- **Web recommender loops the identical canned line — six times in a row — while the customer begs for one recommendation** — Transcript evidence is genuine (pt-web-chats.txt:344-355, Web chat 26 Jun 7 2026 shows the identical line 6x; also chats 22/27/35 and chat 2's early turns), but the finding is stale: every occurrence predates a fix that …

- **Inconsistent capability on fitment specs: answers bolt pattern confidently in one chat, claims it "can't look up bolt patterns" in others** — Quotes are accurate but the diagnosis is wrong; the behavior is deterministic, not "random capability," and the proposed fix is already built. (1) Web 36 (Forester, Jun 5 20:17) predates the bolt-pattern feature — commit…

- **Second location is invisible: customers asking about another/"Edmonton Trail" location never get the NE store info** — Refuted on both diagnosis and fix. (1) The claim "the agent only ever knows 111 42 Ave SW" is false: src/lib/sms/agent.ts line 259 has a LOCATIONS block with exactly the proposed routing rule (two Calgary shops; NE store…

- **Web bot is stuck on a stale date and falsely claims 'fully booked' for days, blocking a repair booking** — Refuted. The reviewer misread the transcript dump's session timestamp. Both dump scripts (princetires-app/db/pull-web-chats.mjs:21, db/pull-chat-review.mjs:47) print last_message_at as the session header. Querying sms_co…

- **Bot tells a customer they are booked when no booking exists (no name/phone/email ever captured)** — Evidence quotes are accurate (pt-web-chats.txt:201-203, 231) and the hallucinated 'You're booked' did happen — but on Jun 3, 2026, and it was already caught and fixed on Jun 5, 2026 (princetires-app commit 2fff4d2 'fix(a…

- **Escalation is a black hole: handoffs promised 'shortly' are never picked up, stranding ready-to-buy customers** — Quotes exist at the cited lines, but the 'black hole' interpretation misreads a one-sided log. The transcript dump (db/pull-chat-review.mjs) prints sms_conversations.history, which only records staff replies when the Rin…

- **Bot escalates questions it can demonstrably answer, and its stated capabilities contradict each other** — Cited transcript lines all exist (correction: chat 96 is in /tmp/pt-chat-review-30d.txt ~721-726, not pt-web-chats.txt which has only 464 lines), but the finding's narrative collapses on inspection. (1) The bolt-pattern …

- **Recommendation flow ignores explicit customer constraints and loops the identical canned line six times** — Evidence is genuine — Web chat 26 (Jun 7 2026, /tmp/pt-web-chats.txt:334-355) really shows six verbatim 'Here are a couple that fit and match what you're after:' replies, and at that date the bot genuinely could not hono…

- **Wrong speed-rating spec on a Continental tire — customer had to verify with the manufacturer** — The quoted evidence exists verbatim (/tmp/pt-chat-review-30d.txt lines 356-375, cited 357-360 accurate), but the core claim — 'the bot told them the tire is V-rated' — is refuted by the full conversation record. I querie…

- **Thinking fully disabled on a thinking model, with an even weaker fallback** — Evidence quotes are accurate (agent.ts:428 config and :16-19 MODELS exist verbatim; 12 tools, not 11), and the reviewer is technically right that the empty-reply failure was a maxOutputTokens/thinking interaction. But th…

- **Prompt contradicts itself on whether the agent may name a tire or quote a price** — Quotes are verbatim-accurate (agent.ts:256/271/272), but the finding fails on both structure and evidence. (1) The scoping is IN the text, not "in the author's head": the HARD RULES are "SCENARIO -> action" bullets; line…

- **The prompt is tuned to give up: broad hand-off triggers plus mandated silence feed the 66% escalation / 31 stranded stat** — Cited quotes are real (agent.ts:252, 285; sms/inbound/route.ts:236-241), but the finding's load-bearing claims fail verification. (1) The stats are misread: per db/pull-chat-review.mjs, 'escalations: 66' counts sms_escal…

- **System prompt is a ~2,500-word single wall of nested ALL-CAPS rules with no example dialogues** — The evidence anchors exist but the finding's central claims are wrong. (1) 'Single wall with no sections': false — the prompt already has titled sections (STYLE, WHAT WE DO, TIRE SAFETY, HARD RULES) plus delimited NOTES/…

- **temperature 0.3 fights the prompt's 'VARY the wording every time' demand** — All three citations are textually accurate (agent.ts:428 temperature: 0.3; agent.ts:272 VARY instruction; route.ts:303 dup check), but the causal claim fails against the timeline and transcripts. (1) The only real within…

- **Agent-verified facts get re-injected labeled 'UNVERIFIED customer claims'** — Evidence checks out literally (agent.ts:233 label exists, and the model-authored remember_customer summary does mix tool-derived facts with customer claims), but the claimed harm is already mitigated in the same prompt a…

- **Zero-cards note conflates "size not stocked" with "filters eliminated everything" — agent asserts the size is out of stock when it isn't** — Code citation is accurate: agent.ts:498-503 sets the zero-card note unconditionally and recommendTires (recommend.ts:201-293) has no unfiltered exact-size fallback (its plus-size fallback keeps the same season/vendor fil…

- **TiresVote pickMatch falls back to the brand's FIRST search hit — a tire can be ranked and displayed with a different model's rating** — Code citations are accurate (tiresvote.ts:59-63 has `exact || branded[0]`; recommend.ts:38/240-250 attach+rank by the rating; 30d Redis TTL; cons never surfaced anywhere, getBuyNotBuy has zero callers). But the claimed c…

- **state='human' is a black hole: customer follow-ups are recorded silently with no re-page and the watchdog explicitly excludes them** — Citations are accurate (route.ts:236-241 records silently; watchdog.ts:22 filters state='bot'), but the finding's substance is refuted. (1) Human-state SMS silence is deliberate: staff handle those threads natively in Ri…

- **Escalation policy is over-eager: the shop's core purchase flow (buy tires + install) is hard-coded to hand off, and 'when in doubt, hand off' — explaining the 66% escalation rate** — The cited prompt lines exist verbatim (agent.ts:282 buy+install handoff; :285 'When in doubt, hand off'; :584-591 max_rounds escalation), but the finding's core causal claim is refuted by the live data. (1) The '66%' rat…

- **STOP/START/HELP replies are sent before state is recorded — a send failure loses the opt-out (compliance) and the whole turn** — Cited lines exist as described (send-before-record in STOP/START/HELP branches; catch-all returns 200), but the failure mechanism is impossible: sendSms cannot throw. Both senders behind the dispatcher (src/lib/sms/index…

- **Duplicate-suppression and cap handling convert repeat contact into total silence; rate-limited messages aren't even recorded** — Cited lines are accurate (route.ts:303-305, 267-269, 198-199 all exist as quoted), but the harm thesis is mitigated/mischaracterized on every leg. (1) The degraded reply is NOT static: degradedReply(text) in src/lib/sms/…
