# Internal links for /pages/road-force-balancing

Target: `https://princetires.ca/pages/road-force-balancing`
Built 2026-10-30 from a read-only inventory of the live theme (189939450131, role=main), 81 pages and 238 articles. Nothing here has been written to Shopify.

**Today:** two places on the site link to the page: the /pages/services grid card (s9) and /pages/tire-balancing FAQ 8. The footer, header, menus, homepage and all 238 articles have no link to it.

**How to apply.** Section-built pages ignore `body_html`, so links on those pages go into the template JSON settings and blocks named below. Pages that render `page.content` (locations, road-hazard-protection) and all articles take the link in `body_html`. Theme files and templates need the usual live-diff before push. Page and article `body_html` edits go through the Admin API. Each one is a Shopify write and needs the owner's OK.

**Wording rules applied to every sentence below:**
- Road force is done at Edmonton Trail NE only.
- The +$15 per tire upgrade applies to any job booked there (commit 8814084), not just installs.
- No machine brand or model, and no claim about what "the machine" does beyond what any road force balance does.
- Booking wording is a request, never a confirmation.
- Prince's own claims say "can find", "can show", "is what we'd try", never "finds", "fixes" or "the fix" (Competition Act s.74.01(1)(b)).
- Anchors are varied on purpose. The exact phrase "road force balancing" is kept on the footer, homepage, /pages/services, /pages/contact, /pages/locations and article 3.1; the rest use descriptive anchors so the 29 links don't all repeat one or two phrases.

---

## Priority 1: sitewide and hub links

| # | Source | Where (key) | Current text | New text | Anchor |
|---|---|---|---|---|---|
| 1.1 | **Footer, Services column (every page)** | `sections/pt-footer.liquid`, after the line `<li><a href="/pages/tire-balancing" class="pt-footer__link">Tire Balancing</a></li>` (around L169) | (no link) | `<li><a href="/pages/road-force-balancing" class="pt-footer__link">Road Force Balancing</a></li>` | Road Force Balancing |
| 1.2 | /pages/tire-balancing | `templates/page.tire-balancing.json` → `sections.explainer-signs.settings.outro` | "If the vibration is constant at every speed rather than arriving at highway speed, it is more likely a bent wheel or a tire fault than a weight problem." | Append: "A `<a href="/pages/road-force-balancing">road force balance</a>` at our Edmonton Trail NE shop can help tell those apart." | road force balance |
| 1.3 | Homepage | `templates/index.json` → `faq_home_6nkgUA.blocks.question_9xBRnL.settings.answer` | "...tire installation, `<a href='/pages/tire-balancing'>tire balancing</a>`, tire rotation..." | "...tire installation, `<a href='/pages/tire-balancing'>tire balancing</a>` (and `<a href='/pages/road-force-balancing'>road force balancing</a>` at our Edmonton Trail NE shop), tire rotation..." | road force balancing |
| 1.4 | /pages/services | `templates/page.all-services.json` (live version; the repo copy is stale) → `sections.faq.blocks.f1.settings.answer` ("How much do tire services cost in Calgary?") | (grid card s9 already links) | Append: "`<a href="/pages/road-force-balancing">Road force balancing</a>` is $35 per wheel at our Edmonton Trail NE shop." | Road force balancing |
| 1.5 | /pages/tire-installation-calgary | `templates/page.tire-installation-calgary.json` → `sections.explainer-included.blocks.b3.settings.text` | "Every new tire is balanced as part of the install — spun on a computer balancer and weighted so it runs true. That is included, not an add-on." | Append: "On low-profile tires, big wheels or an EV, you can upgrade to a `<a href="/pages/road-force-balancing">road force balance</a>` for $15 per tire when you book at Edmonton Trail NE." | road force balance |
| 1.6 | /pages/contact | `templates/page.contact.json` (live version) → `sections.main.settings.info_lead` | "...Edmonton Trail NE is handy if you're north of downtown." | "...Edmonton Trail NE is handy if you're north of downtown, and it's the shop that does `<a href="/pages/road-force-balancing">road force balancing</a>`." | road force balancing |

Note for /pages/tire-balancing: this page says standard balancing is at both shops, but tire-balancing's subheading and FAQs 1, 3 and 7 say SW only. FAQ 7 is fixed in `build/templates/page.tire-balancing.json` (live copy, only `faq_7.answer` changed). The subheading ("same-day at our SW Calgary shop") and FAQs 1 and 3 ("in SW Calgary", "drop the vehicle at our SW Calgary shop") still read as SW-only; owner to decide wording. Re-pull that template live and re-apply before pushing.

Note for 1.1: the same footer column links /pages/performance-tires, /pages/light-truck-tires and /pages/trailer-tires. All three now 301 to /collections/*. Fix them in the same edit.

## Priority 2: service pages that match the intent

| # | Source | Where (key) | Current text | New text | Anchor |
|---|---|---|---|---|---|
| 2.1 | /pages/tire-repair-calgary | `templates/page.tire-repair-calgary.json` → `sections.explainer-signs.blocks.b4.settings.text` (lead: "The tire is sitting low after a pothole") | "...neither of those is a puncture. Neither is a puncture, and both need..." | Delete the repeated sentence "Neither is a puncture," then append: "If the tire holds air but the steering wheel hasn't felt right since, a `<a href="/pages/road-force-balancing">road force balance</a>` can flag a bend you can't see." | road force balance |
| 2.2 | /pages/wheels-and-rims-calgary | `templates/page.wheels-and-rims-calgary.json` → `sections.explainer-install.blocks.i1.settings.text` (lead: "Mount + balance on every wheel.") | "Computer balancing to the gram. No wheel weights showing on the outside of premium alloys." | Append: "Going to 19-inch or bigger? Ask for a `<a href="/pages/road-force-balancing">road force balance at Edmonton Trail NE</a>` when the new set goes on." (Fallback location: `explainer-meaning.b3`.) | road force balance at Edmonton Trail NE |
| 2.3 | /pages/seasonal-tire-change-calgary | `templates/page.seasonal-tire-change-calgary.json` → `sections.explainer-difference.settings.outro` | "Not sure which you have? Look at your off-season tires. If they are sitting on wheels, it is a changeover." | Add a new `<p>`: "If a set that rode fine last season shakes at highway speed once it goes back on, give it 20 minutes or more of highway driving first; most storage flat spots warm out. If it doesn't settle, a `<a href="/pages/tire-balancing">standard balance</a>` is the first step and `<a href="/pages/road-force-balancing">road force balancing at Edmonton Trail NE</a>` is the next step." | road force balancing at Edmonton Trail NE |
| 2.4 | /pages/tire-rotation | `templates/page.tire-rotation.json` → `sections.main.blocks.faq_6.settings.answer` (rotation vs balancing) | (already links /pages/tire-balancing) | Append: "If a balance doesn't cure the shake, a `<a href="/pages/road-force-balancing">road force test at Edmonton Trail NE</a>` can find the stiff spot or bent wheel behind it." | road force test at Edmonton Trail NE |
| 2.5 | /pages/tires | `templates/page.tires.json` → `sections.install.blocks.i2.settings.text` (lead: "Mount + balance + TPMS reset included.") | — | Append: "Want more than a standard balance? Ask for the `<a href="/pages/road-force-balancing">$15 per tire road force upgrade</a>` at Edmonton Trail NE." | $15 per tire road force upgrade |
| 2.6 | /pages/fleet-tires-calgary | `templates/page.fleet-tires-calgary.json` → `sections.explainer-what.blocks.b4.settings.text` | "42 Ave SW and Edmonton Trail NE, which helps when vehicles are based on different sides of the city." | Append: "Edmonton Trail NE can also `<a href="/pages/road-force-balancing">road force test a unit that still shakes after a regular balance</a>`." | road force test a unit that still shakes after a regular balance |
| 2.7 | /pages/winter-tires-calgary | `templates/page.winter-tires-calgary.json` → `sections.explainer-install.blocks.i5.settings.text` (lead: "TPMS service included with install...") | — | Append: "Standard balancing is included too; on a heavy EV or low-profile set, the `<a href="/pages/road-force-balancing">road force upgrade</a>` is $15 per tire at Edmonton Trail NE." | road force upgrade |
| 2.8 | /pages/locations | `body_html`. The page falls back to page.json, so `page.content` renders. | (28-word page: H1 plus both addresses) | Under the NE address: "Edmonton Trail NE is also where we do `<a href="/pages/road-force-balancing">road force balancing</a>`, the only one of our two shops that offers it." | road force balancing |

Fix while you're in these files:
- tires i5 says "Off-season storage available.", which contradicts seasonal faq_5 ("no storage").
- winter i3 says "Road-hazard coverage available on select brands"; the in-house Protection Plan exists.
- /pages/locations and /pages/faq are thin, and both are linked from the footer.

## Priority 3: articles (published), highest match first

All of these take the link in `body_html` via Admin API PUT. Keep the handle, and check that the target URL isn't already present before appending.

| # | Article handle | Where | New text | Anchor |
|---|---|---|---|---|
| 3.1 | why-your-steering-wheel-shakes-and-which-tire-issue-is-to-blame | H2 "Cause 2: Bent Rim or Tire Deformation", after "A bent rim or flat-spotted tire visibly hops at each rotation." | "A small bend, or a stiff spot inside the tire, often won't show up that way or on a regular balancer. That's what `<a href="/pages/road-force-balancing">road force balancing</a>` is for: it loads each tire with a roller the way the road does and measures how hard it pushes back. We do it at our Edmonton Trail NE shop for $35 per wheel." | road force balancing |
| 3.2 | best-tires-for-a-ram-1500-in-calgary | FAQ "Do I need to balance new tires when I install them?" (current answer implies road force is included) | Replace with: "Yes, always. A standard balance is part of every tire installation at Prince Tires. For big A/T or LT tires, you can upgrade to `<a href="/pages/road-force-balancing">road force balancing for $15 per tire</a>` at our Edmonton Trail NE shop." | road force balancing for $15 per tire |
| 3.3 | all-terrain-tires-in-calgary-cost-lifespan-snow-performance | FAQ Q4 (currently claims "alignment services", which is false) | Replace with: "Yes. Prince Tires mounts and balances all-terrain tires, and at our Edmonton Trail NE shop you can upgrade to `<a href="/pages/road-force-balancing">road force balancing for big A/T tires</a>` that still shake at highway speed. We don't do wheel alignment." | road force balancing for big A/T tires |
| 3.4 | spring-potholes-in-calgary-how-they-damage-tires-and-what-to-do | H2 "What to Do Immediately After Hitting a Calgary Pothole", end of the paragraph starting "Pay close attention to how the vehicle handles..." | "If the tire holds air but the vibration stays, a `<a href="/pages/road-force-balancing">road force balance</a>` can flag a slightly bent wheel you can't see." | road force balance |
| 3.5 | wheel-alignment-vs-tire-rotation-vs-balancing-whats-the-difference | H2 "Wheel Balancing: Why Your Steering Wheel Stops Shaking", after "Rule of thumb: if there's any vibration in the steering wheel above 80 km/h, get a balance done before assuming you need an alignment." | "If it's still there after a balance, ask about `<a href="/pages/road-force-balancing">road force balancing</a>` at our Edmonton Trail NE shop." Also repoint its `/pages/tires-installation` link (it 301s to booking) to `/pages/tire-installation-calgary`. | road force balancing |
| 3.6 | wheel-alignment-after-winter-spring-calgary | H2 "Signs your alignment is off", the vibration bullet | Change the ending to: "...if a fresh balance does not fix it, a `<a href="/pages/road-force-balancing">road force balance</a>` is the next step; alignment trouble usually shows up as a pull, not a shake." | road force balance |
| 3.7 | calgarys-worst-roads-for-tires-and-how-to-protect-yourself | H2 "What Pothole and Road Damage Actually Hurts", the bullet "The wheel (rim)..." | Append: "A slight bend can also cause a highway-speed shake that a regular balance won't fix; `<a href="/pages/road-force-balancing">a road force test</a>` is what can find it." | a road force test |
| 3.8 | how-to-read-uneven-tire-wear-patterns | FAQ "My tires look fine but I feel a vibration at highway speed." | Append: "If the balance checks out and the vibration doesn't, road force balancing can `<a href="/pages/road-force-balancing">tell whether one tire is out of round</a>`." | tell whether one tire is out of round |
| 3.9 | ev-specific-tires-do-you-need-them | H2 "What's different about EVs and tires", after the "Quiet cabin" bullet | New bullet: "Small vibrations show up too. A heavy, quiet EV lets you feel tire and wheel flaws a gas car would mask; if a new set doesn't ride smooth, `<a href="/pages/road-force-balancing">road force balancing at our Edmonton Trail NE shop</a>` is what we'd try first." | road force balancing at our Edmonton Trail NE shop |
| 3.10 | plus-sizing-wheels-pros-and-cons | H2 "Plus-sizing on Calgary roads", end of the paragraph ending "...extra careful through pothole season" | "Low-profile tires also pass small tire and wheel flaws straight into the cabin, so a `<a href="/pages/road-force-balancing">road force balance on the new set</a>` is worth asking for." | road force balance on the new set |
| 3.11 | performance-tires-101-summer-uhp-vs-max-performance-vs-track | FAQ "Do you balance and mount performance tires differently...", after "The mounting and balancing process is the same — same equipment, same care." | "If you want more than a standard balance on low-profile performance tires, the `<a href="/pages/road-force-balancing">road force upgrade</a>` is $15 per tire at Edmonton Trail NE." | road force upgrade |
| 3.12 | tire-warranties-decoded-whats-covered | H2 "Workmanship and materials warranty" | "A tire that won't ride smooth even after balancing may have a uniformity problem; a `<a href="/pages/road-force-balancing">road force reading</a>` gives you a number to take to the tire maker." | road force reading |
| 3.13 | tire-balancing-vs-alignment-whats-the-difference-and-why-does-it-matter | H2 "Tire Balancing", after "Tire balancing is typically done using specialized equipment..." | "If a vibration survives a regular balance, the next step is a `<a href="/pages/road-force-balancing">road force balance</a>`." | road force balance |
| 3.14 | spring-alignment-check-why-pothole-season-makes-it-essential | the "Vibration paired with a pull" bullet | Append: "...a `<a href="/pages/road-force-balancing">road force balance</a>` can show whether a wheel took the hit." | road force balance |
| 3.15 | tire-rotation-in-calgary-how-often-why-it-matters-what-it-costs | warning sign 3 ("...you may need balancing or replacement") | Append: "...and if a balance doesn't settle it, see `<a href="/pages/road-force-balancing">how road force balancing differs from a regular balance</a>`." | how road force balancing differs from a regular balance |

Accuracy fixes in the same articles. Do these with the link edit or the article stays wrong:
- 3.1 says "$15 to $25 per wheel"; the price is $20. It also says the seasonal changeover "includes computer balancing on every wheel by default", which contradicts the live seasonal page.
- 3.3 claims alignment.
- 3.6 says "balancing is included with every changeover".
- 3.11 links /pages/performance-tires and /pages/wheels-and-rims, which 301.

**Drafts to link when they publish:** steering-wheel-vibrates-highway-winter, what-tire-cupping-looks-like-and-what-causes-it, bent-rim-pothole-repair-or-replace, pothole-season-calgary-tire-rim-damage, what-causes-tire-flat-spots-in-cold-weather, snow-tires-for-evs, best-tires-tesla-model-y-calgary. Two drafts are alignment topics Prince doesn't offer: how-potholes-knock-your-wheels-out-of-alignment and signs-you-need-wheel-alignment. Review them before publishing.

## Priority 4: optional, needs a decision

| # | Source | Where | New text | Anchor | Why it waits |
|---|---|---|---|---|---|
| 4.1 | /pages/road-hazard-protection | `body_html`, after the "Potholes & Impact" paragraph | "If a tire survives the hit but the car hasn't ridden smooth since, a `<a href="/pages/road-force-balancing">road force balance</a>` at Edmonton Trail NE can flag a bent wheel." | road force balance | The same page shows the NE phone as (403) 953-4283 (correct: (825) 395-4024). Its terms (10% / $12–$50 / 12 months) conflict with memory (15% / $15–$60 / 36 months). Fix those first. |
| 4.2 | /pages/returns-policy (and /pages/returns-warranty, same template) | section "10. Workmanship guarantee", after "We may need to ride along on a short test drive to reproduce balance complaints." | "If a balance complaint persists, we may recommend `<a href="/pages/road-force-balancing">road force balancing</a>` to measure whether a tire is out of spec." | road force balancing | Legal page; the Service Terms draft is with the lawyer. |
| 4.3 | /pages/about | `about_process.blocks.step_4.settings.body` | Append: "At Edmonton Trail NE you can upgrade to `<a href="/pages/road-force-balancing">road force balancing</a>`." | road force balancing | Low value until the About page stops listing Airdrie, Cochrane, Okotoks, Chestermere, Crossfield, Strathmore and High River (subheading, faq_4 and schema_description). That breaks the no-surrounding-towns rule. |

## Menus and header

- **Footer** (item 1.1) is the only navigation change with an effect. `pt-footer.liquid` is hardcoded and is a theme push.
- **Header** (`pt-header.liquid`) is hardcoded and has no services dropdown. Leave it.
- **Shopify `main-menu`** isn't rendered by the header, so adding road force there does nothing today. If it is ever wired up, clean it first:
  - Services → `/pages/services`, not `/pages/all-services`, which 301s.
  - TPMS → `/pages/tpms-calgary` (avoids a 301 chain).
  - Tire Repair → `/pages/tire-repair-calgary`.
  - Then add "Road Force Balancing" → `/pages/road-force-balancing` under Services, after Tire Balancing.
- The Yocale "Appointments" link in `prince-tires-menu` is legacy.

## Outbound internal links on the new page (already in the built template)

| Where on the page | Anchor | Target |
|---|---|---|
| Hero CTA, location card CTA, closing CTA, FAQ 11 | Request road force balancing / booking page | `/pages/booking?service=road_force_balancing&location=ne` |
| Panel "Signs you need a road force balance", last paragraph | why your steering wheel shakes | `/blogs/news/why-your-steering-wheel-shakes-and-which-tire-issue-is-to-blame` |
| Panel "Who benefits", low-profile bullet | 19-inch and bigger wheel packages | `/pages/wheels-and-rims-calgary` |
| Panel "Who benefits", new-tires bullet; FAQ 2; FAQ 9 | tire installation | `/pages/tire-installation-calgary` |
| Panel "What road force readings mean" | what tire warranties cover | `/blogs/news/tire-warranties-decoded-whats-covered` |
| Comparison intro (first link on the page to it) | standard (spin) balance | `/pages/tire-balancing` |
| FAQ 10 | Standard wheel balancing | `/pages/tire-balancing` |
| Related links block (7 cards) | Wheel balancing · Tire installation · Wheels and rims · Tire repair · Seasonal tire change · Why your steering wheel shakes · Calgary potholes and your tires | `/pages/tire-balancing`, `/pages/tire-installation-calgary`, `/pages/wheels-and-rims-calgary`, `/pages/tire-repair-calgary`, `/pages/seasonal-tire-change-calgary`, the two articles |

Deliberately not linked: `/pages/locations` (28 words) and `/pages/faq` (3 words), until they have content. `/pages/all-services` 301s, so use `/pages/services` wherever services are linked. (It is no longer the BreadcrumbList parent: the page's JSON-LD trail is now Home > page, to match the visible breadcrumb.)

## Order of work

1. Footer (1.1), plus the three broken footer links. One theme push, live-diffed first.
2. Template-setting links 1.2–1.6 and 2.1–2.7. These are template JSON edits, so they can ride the same push as the new road force template. Pull each live template fresh and diff it first; all-services, contact and index differ from the repo.
3. Articles 3.1–3.6, each with its accuracy fix. Admin API, one PUT per article.
4. Articles 3.7–3.15, plus /pages/locations (2.8).
5. Priority 4 once the decisions are made.
