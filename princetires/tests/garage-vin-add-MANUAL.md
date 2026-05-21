# Garage — Add by VIN · manual QA checklist

The `/pages/garage` page is customer-account-gated, so the full add-vehicle
flow can't be exercised by a logged-out Playwright session. Run this
checklist by hand after each `my-garage.{liquid,js}` change.

**Prereq:** the `princetires-app` /api/decode-vin route must be deployed to
Vercel with no env vars (NHTSA needs no key). The wheel-fitment session
already covers the deploy step.

## Setup
1. Log in as a test customer at https://princetires.ca/account/login
2. Navigate to https://princetires.ca/pages/garage
3. Tap **+ Add vehicle** (or **Add your first vehicle** if the garage is empty)

## Happy path — valid VIN
1. Paste `2HGFC2F69LH567890` into the **VIN** field (a real-shape Honda Civic VIN).
2. Click **Decode**.
3. Expect: button shows a spinner, then within ~1 sec the status row turns
   green and says **"Decoded: 2020 HONDA Civic LX. Tap Save to add this
   vehicle."**
4. The Year dropdown should jump to `2020`.
5. The Make dropdown should jump to `HONDA` (or `Honda` depending on the
   case used in `pt-vehicle-2020.json`).
6. The Model dropdown should jump to `Civic`.
7. The Trim dropdown should jump to `LX` (if our trims list includes it).
8. The **Save vehicle** button should become enabled.
9. Click **Save** — vehicle appears in the garage list.

## Input cleanup
1. Type or paste `2HG-FC2 F69LH567890` (with hyphen + space).
2. The input should auto-clean to `2HGFC2F69LH567890` as you type.

## Invalid VIN — wrong length
1. Type `ABC123` and click **Decode**.
2. Expect: red status — _"VIN must be exactly 17 characters and exclude
   I, O and Q."_

## Invalid VIN — contains "I"
1. Type `IHGFC2F69LH567890` and click **Decode**.
2. Expect: red status — same message as above (regex catches I/O/Q).

## VIN that NHTSA can't decode
1. Type a 17-char string of valid letters that isn't a real VIN
   (e.g. `ABCDEFGHJKLMNPRST`).
2. Click **Decode**.
3. Expect: red status — _"NHTSA didn't recognize that VIN…"_

## Make/model not in our list
- This is hard to trigger with a real VIN. If our `pt-vehicle-YYYY.json`
  files are missing a make/model that NHTSA returns, the red status will
  say _"We don't have [Make] in our list yet — fill it manually."_
- The manual cascade below should still work.

## Manual cascade still works
1. Click **Decode** with no VIN → no error (button does nothing).
2. Skip the VIN row entirely → pick Year → Make → Model → Trim manually.
3. **Save vehicle** behaves the same as before.

## Network failure
1. Block app.princetires.ca in browser devtools.
2. Paste a valid VIN, click Decode.
3. Expect: red status — _"Couldn't reach the decoder — try again, or fill
   the form manually."_
