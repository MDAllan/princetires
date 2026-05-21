# Wheel storefront filters · 60-second admin checklist

The 4 new wheel-fitment metafields (`custom.bolt_pattern`, `custom.rim_width`,
`custom.rim_offset`, `custom.center_bore`) need to be **manually** enabled as
storefront filters in the Search & Discovery channel app. Shopify doesn't
expose this in the Admin API — it lives inside Search & Discovery's own
internal config.

This is what unlocks:
- The smart-search "**Wheels that fit your car**" CTA actually filtering
  results (today the URL parameter is silently ignored without this).
- The 4 new filter checkboxes in the `/collections/wheels` sidebar.

## Click-path (~60 seconds)

1. Open **Shopify Admin** → **Online Store** → **Search & Discovery** (left nav).
2. Click the **Filters** tab.
3. Scroll to the **Filter list** section and click **Edit filters**.
4. Click **Add filter**.
5. In the picker, find each of these under **Product metafield → Custom**:
   - **Bolt Pattern** ← highest priority — needed for "Wheels that fit your car"
   - **Rim Width**
   - **Rim Offset**
   - **Center Bore**
6. For each one, set:
   - **Display name** = the same name (Bolt Pattern, Rim Width, etc.) — keep it short
   - **Behavior** = **List** (so customers see all bolt patterns as checkboxes)
   - **Active** = ✅ on
7. Click **Save**.

`custom.rim_diameter` is **already** wired as a filter from the previous
collection-page session — don't re-add it.

## Verify

After save, visit:
- https://princetires.ca/collections/wheels — the sidebar should now show
  Bolt Pattern, Rim Width, Rim Offset, Center Bore as filter sections.
- https://princetires.ca/collections/wheels?filter.p.m.custom.bolt_pattern=5x114.3
  — should narrow from 41 to ~20 wheels (most Honda/Toyota wheels are 5x114.3).

## Why we can't do this via the Admin API

Confirmed via `shopify-dev-mcp` docs (2026-05-20): the relevant Admin API
metafield capabilities are `adminFilterable` (admin product search, NOT the
storefront), `smartCollectionCondition` (smart collection rules), and
`storefrontAccess` (Storefront API read permission — NOT customer-facing
filters). The customer-facing **collection-page filter sidebar** is configured
by the Search & Discovery channel app, whose configuration UI is admin-only.

`adminFilterable` has been programmatically enabled on all 4 definitions —
they'll appear as filters in product admin search regardless of the
storefront step.
