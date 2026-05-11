# Missing-vehicle webhook setup

The tire-search widget's "Don't see your vehicle?" form posts to a Google Apps Script Web App, which appends a row to a Google Sheet. One-time setup, ~10 minutes.

## 1. Create the Google Sheet

1. Visit https://sheets.new — a fresh Sheet opens.
2. Rename it "Prince Tires — Missing Vehicles".
3. In row 1, paste this header row (comma-separated, then Ctrl/Cmd+V — it'll split into columns):
   ```
   Timestamp,Vehicle (free text),Year,Make,Model,Trim,Page URL,User agent
   ```

## 2. Add the Apps Script

1. In the Sheet, click **Extensions → Apps Script**.
2. Delete any starter code, paste this:

   ```javascript
   const SHEET_NAME = 'Sheet1'; // change if you renamed the tab

   function doPost(e) {
     try {
       const data = JSON.parse(e.postData.contents || '{}');
       const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
       sheet.appendRow([
         data.timestamp || new Date().toISOString(),
         data.vehicle   || '',
         data.year      || '',
         data.make      || '',
         data.model     || '',
         data.trim      || '',
         data.page_url  || '',
         data.user_agent|| ''
       ]);
       return ContentService
         .createTextOutput(JSON.stringify({ ok: true }))
         .setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService
         .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
         .setMimeType(ContentService.MimeType.JSON);
     }
   }
   ```

3. Save (disk icon). Name the project "Prince Tires — Missing Vehicles Webhook".

## 3. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" → choose **Web app**.
3. Fill in:
   - Description: `v1`
   - Execute as: **Me** (your Google account)
   - Who has access: **Anyone**  ← required for the storefront to POST without auth
4. Click **Deploy**. Authorize when prompted (Google will warn it's an "unverified app" — that's expected for personal Apps Scripts; click **Advanced → Go to project (unsafe)** → Allow).
5. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/AKfycb…/exec`).

## 4. Paste into the theme setting

1. Shopify admin → **Online Store → Themes → Customize → Theme settings → Smart search** (or wherever the setting lives).
2. Paste the Web app URL into **Missing-vehicle form webhook URL**.
3. Save the theme.

## 5. Test end-to-end

1. Open the booking page on the live store (or a preview).
2. Switch to the Vehicle tab → "Don't see your vehicle?" → type "2018 Subaru Test" → Send.
3. Confirm the form shows "Thanks — we'll add it." and the input clears.
4. Check the Google Sheet — a new row appears within a second.

## Rotating the URL

If you ever need to revoke or rotate the URL, redeploy in Apps Script (creates a new URL) and update the theme setting. The old URL stops working immediately.

## Troubleshooting

- **Form falls back to mailto every time:** Either the theme setting is blank, or the deployed Web App URL is wrong. Re-copy the URL from Apps Script → Deploy → Manage deployments.
- **Sheet doesn't get rows but no error appears:** Open the Apps Script editor → Executions tab. Look for failed runs and check the error message.
- **CORS error in browser DevTools:** The form posts with `Content-Type: text/plain` to avoid CORS preflight. If you change the content type in `pt-tire-search.liquid`, the Apps Script will reject the request. Keep `text/plain`.
