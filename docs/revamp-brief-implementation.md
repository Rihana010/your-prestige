# Product management & WhatsApp ordering revamp — implementation notes

Implements `Product Management & WhatsApp Ordering Revamp` brief. Built on a branch; nothing here touches the live site until it is reviewed and deployed.

## What changed (by brief section)

| Brief section | What was done |
|---|---|
| **1. Brand-wise structure** | `Category.brandId` (nullable; `null` = shared, i.e. every existing category). A brand's categories — and their subcategories, which inherit the brand — show on `/brands/[slug]` even while empty. Admin enforces: no cycles, subcategory brand = parent brand, can't move a category to a brand while it holds other brands' products. Categories are created/edited/deleted/reordered/assigned in the admin; nothing new is hardcoded. |
| **2. Showcase media** | `Category.video` + `videoPoster` (banner and card image already existed; brands already had logo/banner/hero video/poster). Hero shows video → banner → image → clean text header. A video that fails to load falls back to the image. Uploads/replacement go through the existing admin upload fields. |
| **3. Product management** | **SKU and Product code fields** added to the product form (they were not editable before). Brand ↔ category are linked: choosing a brand shows only that brand's + shared categories; picking a brand-owned category sets the brand. **Duplicate prevention:** SKU already used → refused; same name under the same brand+category → refused (suggests a variant). **Admin list:** filter by brand, category (includes subcategories), visibility, and "needs brand/category"; search also matches SKU, product code and variant SKUs. **Bulk:** assign brand/category (all-or-nothing, validated), publish, hide, delete. Gallery, specifications, sizes and variants were already in the form. |
| **4. Customer pages** | Honest empty state ("being added", not "no products for these filters"); text-only header when there is no media; **Brand › Category › Subcategory** breadcrumb and subcategory chips on brand category pages; variant picker on the product page. |
| **5. Order management** | New admin page `/admin/orders`: search by reference / product / code / customer, status filter, detail drawer (customer, ordered products, quantities, variants), internal notes, trash/restore. Permission module `orders`. |
| **6. WhatsApp ordering** | Variant picker, typeable quantity, order **saved first**, then WhatsApp opens with the same details + an order reference. Same product in two variants = two lines. Multi-product Enquiry List sends as one order. Falls back to an unsaved message if our server is unreachable. Uses the configured business number (`whatsapp.number` setting → `business.whatsapp` → site config). No automation, CRM or chat features added. |
| **7. Admin / CMS** | Category delete is blocked while it holds products or subcategories; **brand delete is blocked while it owns products, categories or collections**. **Reordering fixed:** the existing up/down buttons did nothing while sort numbers were all the default 0 — they now renumber siblings first (categories within the same parent and brand scope). |
| **9. Safety** | Additive SQL only. No data deleted, no destructive migration, no change to inventory/auth/permissions beyond adding the `orders` module. |

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
10. Admin → Products: filter by brand + category; select 2–3 products → Assign to a brand-owned category of a different brand → refused, nothing changes; set the brand too → applied. Publish / Hide a selection and confirm the public site follows.
11. Admin → Products: create a product with an existing SKU → refused with the other product's name. Create the same name under the same brand+category → refused.
12. Admin → Brands and Categories: press the up/down arrows on a fresh catalogue (all sort numbers 0) → order changes. Try deleting a brand that has products → refused.
13. `/brands/<brand>/<category-with-subcategories>` → subcategory chips and the Brand › Category › Subcategory breadcrumb.
14. Roles: SHOWROOM_STAFF can view/update orders; VIEWER can view only; DEALER has no Orders.

## Verified so far

- `tsc --noEmit`: 0 errors. ESLint on changed files: 0 errors (1 pre-existing unused-import warning).
- Run against a fake database (45 checks): order creation (variant belongs to product, variant required, bad input rejected, duplicate-reference retry, server-side snapshots, correct `wa.me` link); product duplicate prevention; bulk assign (all-or-nothing) and bulk status; category cycle/brand rules, delete guards, reordering from the all-zero default; brand delete guard.
- **Not run:** `next build` (Google Fonts is blocked in the build sandbox), anything against a real database, and visual checks on a phone. Use the checklist above on staging.

## Known limits / follow-ups

- **Pricing:** price/MRP exist per variant and on the product row, but the public site is a luxury catalogue and deliberately shows only a price indicator, so no price fields were added to the product form. Availability is the Visibility control (Published / Draft / Hidden); the public site shows no stock figures by design.
- **Broken product images:** the shared image component already falls back safely, but a full sweep of the catalogue for broken URLs was not done — Admin → Media Health Check and Image Review exist for that.
- The top-level `/tiles` and `/bathware` sections are fixed routes (pre-existing). Everything beneath them is dynamic.
- Reordering is up/down buttons, not drag-and-drop.
- Rate limiting on `/api/orders` is in-memory per instance (same as `/api/leads`); swap for Redis/Upstash if the site scales out.
- Category slugs are globally unique, so brand-specific categories need the brand in the slug (e.g. `jaquar-faucets`). Per-brand unique slugs would be a larger, riskier schema change.
- No performance profiling was done; brand pages add one extra query for brand-owned categories.
- `ProductWhatsAppActions.tsx` is unused dead code (left alone).
