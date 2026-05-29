# Prince Tires — Search Synonyms

Enter these groups in **Shopify admin → Apps → Search & Discovery → Synonyms**. They apply to the native Shopify `/search` results page (server-side). Use "equivalent" synonyms so every term in a group is treated interchangeably.

---

## Season

| Group | Terms |
|---|---|
| Winter | winter, snow, snow tires, ice, snowy, icy |
| All-Season | all-season, all season, allseason, 4-season, four season |
| All-Weather | all-weather, all weather, all season all weather |
| Summer | summer, performance, performance tires, UHP, ultra high performance |

## Terrain / Use

| Group | Terms |
|---|---|
| Mud-Terrain | mud-terrain, mud terrain, mud, MT, M-T, M/T |
| All-Terrain | all-terrain, all terrain, AT, A-T, A/T |
| Highway-Terrain | highway terrain, highway, HT, H-T, H/T |
| All-Terrain / Mud-Terrain (general off-road) | off-road, offroad, off road |

## Vehicle / Service Type

| Group | Terms |
|---|---|
| Light Truck | light truck, LT, truck tires, half-ton, pickup tires |
| Trailer | trailer, ST, trailer tires, specialty trailer |
| Passenger | passenger, P-metric, car tires |

## Wheels / Rims

| Group | Terms |
|---|---|
| Wheels / Rims | rims, wheels, rim, wheel, alloy wheels, alloy rims, aftermarket rims |

## Brand Aliases

| Canonical name | Aliases to add |
|---|---|
| BFGoodrich | BFG, BF Goodrich, BFGoodrich tires |
| Mickey Thompson | Mickey, Mickey T, MT (note: also overlaps mud-terrain — add with care) |
| General | General Tire, General tires |
| Uniroyal | Uniroyal tires |

> Note on Mickey Thompson / MT: "MT" is ambiguous (mud-terrain vs. Mickey Thompson). Shopify synonym groups are broad — if most of your customers using "MT" mean the brand, add it; if they mostly mean the tread type, skip it.

## Common misspellings (add as one-way synonyms pointing to the correct term)

| Misspelling | Correct term |
|---|---|
| Michelen | Michelin |
| Michellin | Michelin |
| Bridgston | Bridgestone |
| Goodyear tyre | Goodyear |
| Continental tyre | Continental |
| Yokahama | Yokohama |
| Hancook | Hankook |

> One-way synonyms: search for the misspelling → return results for the correct term, but not vice versa.

## SimGym additions (2026-05-29) — AI-shopper rec #9

Driven by the AI-shopper simulation finding shoppers searched these terms expecting matches in the relevant collection. The in-bar smart search already handles `tire-size patterns` (e.g. `225/65R17`) natively via `assets/pt-tire-parse.js`; these entries cover the storefront `/search` results page.

| Group | Terms |
|---|---|
| Winter (3PMS rating) | 3PMS, 3PMSF, three-peak, three peak mountain, severe snow rated, snowflake |
| TPMS | TPMS, tire pressure sensor, tyre pressure sensor, tire pressure monitoring, pressure sensor, valve sensor |
| Studded winter | studded, studdable, pin studs, stud-ready |
| All-weather (3PMS marked but year-round) | all-weather, all weather, 3PMS marked, year-round tires |

### What to skip

- **"passenger" alone** — Group 31 above maps `passenger / P-metric / car tires` together, which is correct. Do NOT add `passenger → tires` as a one-way synonym; it's too broad and would match almost every product.
- **Tire-size aliases** — `225/65R17`, `225 65 17`, `225-65-17` are all parsed natively by the smart-search bar (`PTTireParse.parseSize`) and routed to `?filter.p.m.custom.tire_size=225/65R17`. Don't add as Shopify synonyms.
