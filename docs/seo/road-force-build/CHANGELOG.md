# Road force page build: review fixes, 2026-10-30

Nothing was written to Shopify. Nothing was pushed. Every edit is in this `build/` folder. The pre-fix copy is in `../pre-fix/build/`.

Three reviews were applied: SEO/schema, fact-check and Canadian compliance. Where two reviewers disagreed, the stricter accuracy or compliance reading won. Those calls are noted below.

## Checks run after editing

- Every JSON file parses: both templates, `seo-meta.json`, and the section `{% schema %}`.
- Liquid tag balance in `pt-calgary-service.liquid`: if 51/51, unless 5/5, for 8/8, capture 15/15. The liquidjs harness also parses and renders it.
- Harness render: `../review/render-fixed.html`. FAQPage has 12 questions. Service + BreadcrumbList are valid. The tire-balancing render is `../review/render-tb.html`.
- Shopify Theme Check (`validate_theme`) on a copied theme (`../validate2/theme`): the section and both templates pass.
- Rendered page: no "Book" or "book", "Same-day", "hundreds", "registered", "BMW", "45-series" or "Starting from". The provider is AutoPartsStore under `#business-ne`. Offers are $35 and $140. The breadcrumb is Home > Road Force Balancing Calgary.

## Files

| File | What changed |
|---|---|
| `templates/page.road-force-balancing.json` | Copy and settings fixes (see below) |
| `sections/pt-calgary-service.liquid` | Provider type default changed to AutoPartsStore. Two shared fallbacks softened. Breadcrumb setting help text added. |
| `templates/page.tire-balancing.json` | **New in build.** The live copy, with only `faq_7.answer` changed: "both shops balance at $20". |
| `seo-meta.json` | Breadcrumb note, structured-data summary, keyword map, optional description variant, new owner-confirm items |
| `external-links.md` | Citation table fixed. GBP, newsletter, car-club and video wording softened. CASL sender block and unsubscribe line added to every email. "Learn more" button used instead of "Book". |
| `internal-links.md` | 12 anchors varied, Prince claims softened, breadcrumb-parent note fixed, CTA label updated, tire-balancing inconsistency noted |

## Template changes (page.road-force-balancing.json)

**Schema**
- `breadcrumb_parent_label` and `breadcrumb_parent_url` are now `""`. The JSON-LD trail is Home > page, which matches the visible microdata breadcrumb.
- `schema_provider_type` is now `AutoPartsStore`. This gives the `#business-ne` entity one type on the page.
- `price_3` (+$15 upgrade) has `in_schema: false`. Its offer URL pointed at the standalone booking link.
- `price_range` is now `""`. The "Starting from" badge is hidden; the price is a flat $35.

**Headings and hero**
- `how_title` is now "Getting road force balancing at Edmonton Trail NE".
- The `panel_what` heading is now "What is road force balancing, and how does it work?"
- The `panel_match` heading is now "Match mounting: how road force can reduce a vibration".
- `subheading` merges two reviews. It opens with the keyword and a definition (SEO review), and its wording is softened (compliance review): "look for…", "reduce it".

**Hunter paragraph (panel_what)**
- The dyno test is now quoted exactly as the linked 2004 manual prints it: 1.5 oz at 50 mph and 0.75 oz at 70 mph, against its 0.30 oz limit. The old text paired 1.5 oz with 70 mph, which was wrong.
- The page names the manual's edition, because a later manual reportedly swaps the two speeds. I kept the exact numbers rather than a vaguer range: s.74.02 requires a test to be quoted as published, and the "several times the limit" phrasing would be wrong at 70 mph.
- The 1997 date now links Hunter's history page instead of the hunter.com/road-force sales page.
- "Registered" and "shops use the term in general" are gone. The trademark line is now: "Road Force is a trademark of Hunter Engineering Company. Prince Tires is not affiliated with or endorsed by Hunter Engineering. We use “road force balancing” to describe the type of service."

**Sources**
- Continental links now use the canonical `/ca/en/tire-knowledge/flat-spotting/` URL; the old one 301s. The storage-bullet wording now matches both statements on that page (a few kilometres, operating temperature).
- Michelin now reads "more than 20 minutes… relaxes most flat spotting". This change is in the storage bullet and FAQ 7, and how_2 now says "20 minutes or more".
- The EV bullet's unsourced battery claim is replaced by "Continental lists load among the factors behind flat spots, and EVs are heavy." Tesla is now described as "includes a road force balance procedure".
- Brake & Front End: the "45-series" quote was dropped. It now reads "especially useful on very low-profile tires". Reviewers disagreed on whether the article could be confirmed, so I took the stricter reading.
- BMW bullet removed. It had no usable source; the only one found is an archive.org copy of a training PDF.
- The readings closing line now states what Hunter and GM each actually say.
- The Michelin paragraph in panel_wont is replaced with what the page actually says. The brake bullet now links the Hunter manual and says "Hunter’s machine".

**Prince's own claims, softened (s.74.01(1)(b))**
- "Cancel" is now "partly offset" or "offset".
- "Fixes" is now "reduces" or "the first step".
- "Finds/can’t see" is now "can show/can’t measure".
- "Yes; that’s the job" is now "it’s the usual next step".
- These changes are in cmp_9, price_4, link_1, compare_intro, panel_signs, FAQ 1, FAQ 3 and FAQ 4.

**Keyword coverage**
- FAQ 4 adds "It isn’t a gimmick, but it isn’t necessary on every car either."
- FAQ 8 now includes mud-terrain.
- The FAQ 5 question is now "What road force number is good or acceptable?"
- The pothole bullet now says "slightly bent rim".
- `compare_intro` links `/pages/tire-balancing` ("standard (spin) balance").

**Request-only wording (owner rule 2026-10-16)**
- `cta_text` is now "Request road force balancing".
- The FAQ 11 question now ends "how do I request a time?"
- The verb "book" is replaced in panel_signs, panel_who (×2), FAQ 2, 8, 10 and 12, price_3, pricing_intro and location_note.
- FAQ 7 no longer says "the reading will be true".

## Section changes (pt-calgary-service.liquid). These affect all 19 templates.

- The `schema_provider_type` default and Liquid fallback are now AutoPartsStore, and TireShop is listed second with a warning.
- Fallback `trust_2` changed from "✓ Same-day available" to "✓ Request a time online".
- Fallback `cta_bottom_text` changed from "Join hundreds of Calgary drivers who trust Prince Tires." to "Pick a time online and we’ll confirm it with you, or give us a call."
- **This changes visible text on every page that leaves those settings blank**, tire-balancing included. Revert those two lines if the push should touch only this page.

## Not done (optional or out of scope)

- Speakable classes on the H1 and subtitle. It's sitewide and optional.
- Hours on the location card. That waits on the store_hours fix.
- The studded-tire FAQ. It's held until staff confirm.
- Tire-balancing's subheading and FAQs 1 and 3 still read as SW-only. Only FAQ 7 had a specified replacement.
- Fallback closing heading "Ready to book your … in Calgary?" (shared default) left as is.

## Still needs the owner

1. **Machine brand.** Read the NE balancer's plate and send a photo. The page never names a brand. The Hunter locator (external-links §2.2) applies only if it's a Hunter.
2. **What the machine does.**
   - It can flag a slightly bent wheel (subheading, cmp_3).
   - Staff show each wheel's reading (how_3, cmp_5, panel_readings, FAQ 5).
   - Which large tires it fits (FAQ 8, LT bullet).
   - If it can't flag a bent wheel, use the fallback wording in seo-meta.json.
3. **Drip pricing.** Confirm $35 includes the test, match mounting, the remount and rebalance, and the weights, with no fixed shop or disposal fee. Confirm TPMS kits are optional, that the price applies to tires bought anywhere, and that +$15 applies to any NE job, including changeovers.
4. **4.9 Google rating.** Is it the NE profile's rating? It is hardcoded in the trust strip.
5. **NE hours.** The brief (Mon–Sat 9:30–5:30, Sun 10–3:30) and the store_hours metaobject (Mon–Thu/Sat 9–6, Fri split, Sun 10–4) disagree. Fix this before turning on card hours or doing any listing work.
6. **Location wording.** "Between 16 Ave and McKnight": consider "near 40 Ave NE".
7. **Check in a browser.** Both sources return 403 to scripts:
   - the Brake & Front End article
   - the Tesla Model Y manual page (125 N). Switch to en-us if it resolves.
8. **Template order is `['main']`.** Pushing it removes the two live explainer sections, including the unsourced "15 to 20 lb" line. Confirm.
9. **GTM.** The CTA `data-pt-label` changed to "Request road force balancing". Update any trigger that matches the old label.
10. **Sitewide shop description** (Online Store > Preferences): "best and the cheapest tires in Calgary" renders in the AutoPartsStore JSON-LD and the meta tags. Replace it with the factual text in the compliance review.
11. **Photos.** Roller on the tread, reading on screen, tire being turned on the rim, the bay, the storefront. Keep the logo out of shot until the brand is confirmed.
12. **GBP / Apple / Bing / YP / Yelp access.** All of these need the owner's accounts, after the hours are fixed.
13. **CASL.** Before sending any outreach email, record the consent basis (a screenshot of the published address, with URL and date). Send one message, with no follow-up.
14. **About page.** It reportedly lists surrounding towns, which breaks the brand rule. Fix it before linking it (internal-links 4.3).
15. **Push.** Re-pull the live templates and diff them before any push. That includes tire-balancing, since `build/templates/page.tire-balancing.json` is from today's live read.
