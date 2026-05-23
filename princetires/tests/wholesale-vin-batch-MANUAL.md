# Wholesale Bulk VIN Add · manual QA checklist

The "Bulk-add vehicles by VIN" section on `/pages/wholesale-portal` is
behind two gates that Playwright can't satisfy without an actual session:

1. Customer must be logged in
2. Customer must carry the `wholesale` tag

This checklist runs the click-through after deploy. The API itself is
covered by `tests/decode-vin-batch.spec.js` (live, automated).

**Prereqs:** Vercel must have the latest `princetires-app` deployed
(the `/api/decode-vin-batch` route + `vin_decode_batch` rate limiter
shipped via PR #2 / the `wheel-admin-scripts` follow-up).

## Setup

1. Log in as a wholesale-tagged test customer at
   <https://princetires.ca/account/login>.
2. Navigate to <https://princetires.ca/pages/wholesale-portal>.
3. Confirm the tab bar shows **Dashboard · Fleet · Order history · Account**.
4. On the Dashboard panel, scroll past Quick Links — the "Bulk-add vehicles
   by VIN" card should sit between Quick Links and the promo banner.

## Happy path — 3 VINs

1. Paste this list into the textarea (one per line):

   ```
   2HGFC2F69LH567890
   5UXWX7C5LBA12345A
   1FTFW1ET5DKE12345
   ```

2. The counter under the textarea should read **3 VINs**.
3. Click **Decode VINs**. Button shows a spinner, then becomes
   "Decoded 3 of 3 VINs (3 cached)" (assuming all three are valid; the
   first one is — a real-shape 2020 Civic VIN).
4. Three result rows appear below — each shows the VIN, the resolved
   year/make/model/trim, body class · cylinders · displacement · drive
   type, and an **Add to garage** button.
5. Click **Add to garage** on the first row. The button turns green
   and reads "✓ Added".
6. Open <https://princetires.ca/pages/garage> in a new tab — the
   added vehicle should appear in the list with nickname `VIN 567890`.

## Bulk-add + view in Fleet

1. Repeat the paste above.
2. Click **+ Add all decoded to garage**.
3. Each row's button flips to "✓ Added" in sequence (~250 ms apart so
   the writes are paced).
4. The "+ Add all" button transforms into **"✓ All added — view in Fleet →"**.
5. Click it. The portal auto-switches to the **Fleet** tab.
6. Confirm the 3 vehicles appear in the Fleet list with nicknames
   `VIN <last 6>`. Each card shows year/make/model/trim, the "Added"
   date, and Rename / Set default / Delete buttons.

## Fleet panel actions

1. Click **Rename** on any card. The nickname becomes an inline text
   input. Type a new nickname (e.g. `Truck #14`) and press Enter or
   click outside — the new name persists.
2. Click **Set default** on a non-default vehicle. The "Default" red
   badge moves to that card; the previous default loses its badge.
3. Click **Delete** on any card. Confirm the prompt. The card
   disappears; the fleet count decrements.
4. Type a search term in the toolbar (e.g. `Honda` or `2020`). The list
   filters in real time. The visible-count indicator updates to
   "Showing N of total".
5. Click **+ Add more by VIN** in the Fleet panel header — should
   switch back to the Dashboard tab.

## Invalid-format rejection

1. Paste a too-short VIN (`ABC123`) and a VIN with `I` in it
   (`IHGFC2F69LH567890`).
2. Click Decode. Status row reads "Decoded 0 of 2 VINs · 2 invalid format".
3. Both result rows show a red left-border with "Invalid VIN format"
   and no Add button — just a `—`.

## Unknown VIN

1. Paste a valid-shape but fake VIN (`ABCDEFGHJKLMNPRST`).
2. Click Decode. Status row reads
   "Decoded 0 of 1 VINs · 1 unknown".
3. The row shows "Couldn't decode this VIN" with NHTSA's error_text
   underneath (typically about manufacturer not registered).

## Caching

1. Decode the same valid VIN twice in a row.
2. On the second decode, the row should display `· cached` next to
   the VIN string, and the status line should mention "(1 cached)".

## Max-50 cap

1. Paste >50 VINs (real-shape or otherwise).
2. Click Decode. Status row reads
   "Max 50 VINs per batch — split into smaller batches."
3. No upstream call is made.

## Network failure

1. Block `app.princetires.ca` in browser devtools.
2. Decode a single VIN. Status row reads
   "Couldn't reach the decode service. Check your connection and try again."

## Non-wholesale customer

1. Log in as a non-wholesale customer (no `wholesale` tag).
2. Visit `/pages/wholesale-portal` — should redirect to
   `/pages/wholesale` (existing behavior; the VIN section never renders).
