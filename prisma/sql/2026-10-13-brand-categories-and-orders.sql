-- Brand-owned categories, category video showcase, and WhatsApp customer orders.
--
-- Hand-written and ADDITIVE, per the warning at the top of schema.prisma: that
-- file is stale relative to the live database (prestige-inv, a separate app on
-- the same Postgres, owns tables it does not declare), so `prisma migrate dev`
-- / `db push` would generate DROPs for everything it cannot see. Nothing here
-- drops, renames, rewrites or backfills existing data.
--
-- Safe to run more than once — every statement is IF NOT EXISTS / guarded.
--
--   psql "$DIRECT_URL" -f prisma/sql/2026-10-13-brand-categories-and-orders.sql
--   npx prisma generate
--
-- Existing categories keep brandId = NULL, which means "shared across brands"
-- — exactly how every category behaves today — so no page changes behaviour
-- until an admin deliberately assigns a category to a brand.
--
-- The order tables are named CustomerOrder / CustomerOrderItem on purpose:
-- prestige-inv already has depot "Order"-style tables (BlockOrder, ...), and a
-- plain "Order" here would collide with, or be silently skipped in favour of,
-- a table of a different shape. Touches no depot table.

BEGIN;

-- ————— Category: brand ownership + optional video showcase —————

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "brandId"     TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "video"       TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "videoPoster" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Category_brandId_fkey'
  ) THEN
    -- SET NULL, not CASCADE: removing a brand must never delete its categories
    -- (and through them orphan products) — they fall back to "shared".
    ALTER TABLE "Category"
      ADD CONSTRAINT "Category_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Category_brandId_idx" ON "Category" ("brandId");

-- ————— CustomerOrder —————
-- One row per order a customer starts from the website. The order is saved
-- BEFORE WhatsApp opens, so the admin has a record even if the customer never
-- presses send. Item rows snapshot name / SKU / variant so later catalogue
-- edits never rewrite what the customer actually asked for.

CREATE TABLE IF NOT EXISTS "CustomerOrder" (
    "id"             TEXT NOT NULL,
    "orderNumber"    TEXT NOT NULL,
    -- NEW | CONFIRMED | PROCESSING | COMPLETED | CANCELLED
    "status"         TEXT NOT NULL DEFAULT 'NEW',
    "customerName"   TEXT,
    "customerPhone"  TEXT,
    "notes"          TEXT,
    "sourcePage"     TEXT,
    "whatsappNumber" TEXT,
    "adminNotes"     TEXT,
    "deletedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOrder_orderNumber_key" ON "CustomerOrder" ("orderNumber");
CREATE INDEX IF NOT EXISTS "CustomerOrder_status_createdAt_idx" ON "CustomerOrder" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerOrder_deletedAt_idx" ON "CustomerOrder" ("deletedAt");

CREATE TABLE IF NOT EXISTS "CustomerOrderItem" (
    "id"           TEXT NOT NULL,
    "orderId"      TEXT NOT NULL,
    -- Plain columns, not foreign keys: the snapshot below is the record, and a
    -- product or variant being archived or deleted must not touch order history.
    "productId"    TEXT,
    "variantId"    TEXT,
    "productName"  TEXT NOT NULL,
    "brandName"    TEXT,
    "sku"          TEXT,
    "variantLabel" TEXT,
    "size"         TEXT,
    "finish"       TEXT,
    "quantity"     INTEGER NOT NULL,
    "unit"         TEXT NOT NULL DEFAULT 'Boxes',
    "productUrl"   TEXT,
    CONSTRAINT "CustomerOrderItem_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerOrderItem_orderId_fkey'
  ) THEN
    ALTER TABLE "CustomerOrderItem"
      ADD CONSTRAINT "CustomerOrderItem_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CustomerOrderItem_orderId_idx" ON "CustomerOrderItem" ("orderId");
CREATE INDEX IF NOT EXISTS "CustomerOrderItem_productId_idx" ON "CustomerOrderItem" ("productId");

COMMIT;
