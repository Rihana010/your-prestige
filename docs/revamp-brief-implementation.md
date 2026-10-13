# Product management & WhatsApp ordering revamp — implementation notes

Implements `Product Management & WhatsApp Ordering Revamp` brief. Built on a branch; nothing here touches the live site until it is reviewed and deployed.

## What changed

| Brief section | Change |
|---|---|
| 1. Brand-wise categories | `Category.brandId` (nullable). A brand's categories show on `/brands/[slug]` even while empty. `null` = shared (all existing categories, unchanged). Admin enforces: no cycles, subcategory inherits parent's brand, can't move a category to a brand while it holds other brands' products. |
| 2. Optional media | `Category.video` + `Category.videoPoster` (banner/card image already existed). Category hero shows video → banner → image → clean text header. Video load failure falls back to the image. |
| 3. Product management | Product create/update refuses a category owned by a different brand. |
| 4. Customer pages | Honest empty state ("being added", not "no products for these filters"); text-only hero when a category has no media. |
| 5. Order management | New admin page `/admin/orders` (search by ref/product/code/customer, status filter, detail drawer, internal notes, trash/restore). Permission module `orders`. |
| 6. WhatsApp ordering | Variant picker, typeable quantity, order is **saved first** then WhatsApp opens with the same details + order reference. Same product in two variants = two lines. Falls back to an unsaved message if our server is unreachable. Uses the configured business number (`whatsapp.number` setting → `business.whatsapp` → site config); the hardcoded number is gone. |
| 7. Admin | Category form: brand, video, poster. Validation on delete (blocked while products/subcategories remain). |
| 9. Safety | Additive SQL only. No data deleted, no destructive migration. |

## Deploying (in order)

1. **Back up the database.**
2. `psql "$DIRECT_URL" -f prisma/sql/2026-10-13-brand-categories-and-orders.sql` — additive, idempotent, one transaction.
3. `npx prisma generate`
4. Deploy the code.

> Never run `prisma migrate dev` / `db push` in this repo — the schema file is stale relative to the shared database (see the header of `schema.prisma`).

Deploy the code only after step 2: the new Prisma client selects `Category.brandId/video/videoPoster`, and brand pages degrade to empty if those columns are missing.

## Test checklist (needs a staging database)

1. Admin → Categories → create "Jaquar Faucets", Brand = Jaquar, no media. Open `/brands/jaquar` → chip appears; `/brands/jaquar/<slug>` → text header + "being added" empty state, no broken images.
2. Add image, then video + poster → hero shows video; break the video URL → falls back to image.
3. Admin → Products → set a Kohler product's category to "Jaquar Faucets" → refused with a clear message. Set brand = Jaquar → saved, product appears on `/brands/jaquar/<slug>`.
4. Try deleting a category that has products → refused. Try moving a category with other-brand products to a brand → refused.
5. Product with 2 variants → page shows Variant picker. Order 10 Boxes on WhatsApp → WhatsApp opens with ref `PR-YYMMDD-XXXX`, variant, SKU, qty. Admin → Orders shows it as NEW with the same lines.
6. Add the same product in two variants to the Enquiry List → two lines (not merged). Send → one order, list clears.
7. Mobile: sticky bar on a variant product says "Choose & Order" and scrolls to the picker. Check popup-blocked behaviour in iOS Safari.
8. Product without variants still works with the size chips.
9. Settings → set `whatsapp.number` → new orders use it.
10. Roles: SHOWROOM_STAFF can view/update orders; VIEWER can view only; DEALER has no Orders.

## Verified so far

- `tsc --noEmit`: 0 errors. ESLint on changed files: 0 errors.
- Order creation logic (13 checks against a stubbed database): variant belongs to product, variant required when product has variants, unknown product/zero quantity/bad unit rejected, duplicate-reference retry, server-side snapshots, correct `wa.me` link.
- Not run: `next build` (Google Fonts blocked in the build sandbox) and anything needing a live database. Use the checklist above on staging.

## Known limits / follow-ups

- Rate limiting on `/api/orders` is in-memory per instance (same as `/api/leads`); swap for Redis/Upstash if the site scales out.
- Category slugs are globally unique, so brand-specific categories need the brand in the slug (e.g. `jaquar-faucets`). Making slugs unique per brand would be a larger, riskier schema change.
- Product bulk operations, per-brand category reordering UI and a dedicated product form restructure are not part of this pass.
- `ProductWhatsAppActions.tsx` is unused dead code (left alone).
