# Phase 3 — Staff Customer Management (CRM)

**Date:** 2026-05-17
**Status:** In progress
**Phase:** 3 of 6

## Goal

Turn `/admin/customers` from a bookings-derived list into a real CRM driven by
the `customers` table — every synced customer, their real garage, their
bookings, B2B status, and editable staff notes.

## Current state (verified 2026-05-17)

Both `/admin/customers` pages query `bookings GROUP BY customer_email`. They
ignore:

- the **`customers` table** — 476 customers synced from Shopify; anyone who
  hasn't booked is invisible;
- the **`vehicles` garage** — the "Vehicles" section just lists distinct
  vehicle strings from past bookings, not the customer's real saved vehicles;
- **B2B** fields (`is_b2b`, `b2b_company_name`, `b2b_pricing_tier`).

## Build

1. **`db/016-customer-notes.sql`** — `customers.staff_notes text`. Internal,
   staff-owned. `upsertCustomerFromShopify()`'s `ON CONFLICT DO UPDATE` does
   not list this column, so the `customers/*` webhooks preserve it on sync.
2. **List — `customers/page.tsx`** — driven by `customers`, left-joined to
   booking aggregates (by `customer_id`) + vehicle counts. Shows every
   customer; search by name / email / phone; B2B badge; vehicle count column.
3. **Detail — `customers/[id]/page.tsx`** — rekeyed from `[email]` (a customer
   is a record, not an email). Shows the customer record + B2B status, the
   **real garage** (`vehicles` table), full booking history (matched by
   `customer_id` or `customer_email`), and the staff-notes editor.
4. **`customers/[id]/notes-editor.tsx`** + **`customers/actions.ts`** —
   `updateCustomerNotes` server action, audit-logged.
5. The old `customers/[email]/page.tsx` is removed.

## Out of scope

- Editing synced fields (name / email / phone) — they come from Shopify and
  would be overwritten on the next webhook. Only `staff_notes` is staff-owned.
- Creating customers — that's Shopify's job (synced via the `customers/*`
  webhooks).
- Guest bookings with no matching `customers` row — they remain visible in
  `/admin/bookings`; the CRM is the real-customer view.
