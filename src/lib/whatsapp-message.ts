/**
 * Pure WhatsApp message + link builders. No database or server imports, so
 * client components can use these without dragging the Prisma client into the
 * browser bundle (`@/lib/whatsapp` imports Prisma for the ordering-number
 * lookup and re-exports everything here for existing callers).
 */

export const ORDER_UNITS = ["Boxes", "Pieces", "Sq.ft", "Sq.m"] as const;
export type OrderUnit = (typeof ORDER_UNITS)[number];

/** One line of an order, as it appears in the WhatsApp message and the admin. */
export interface OrderLine {
  name: string;
  brand?: string | null;
  sku?: string | null;
  /** Human label of the chosen variant, e.g. "600 × 1200 mm · Matt". */
  variantLabel?: string | null;
  size?: string | null;
  finish?: string | null;
  quantity: number;
  unit: string;
  productUrl?: string | null;
}

/** Strip everything but digits — wa.me wants the bare international number. */
export function cleanWhatsAppNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** `https://wa.me/<number>?text=<message>` */
export function buildWhatsAppLink(whatsappNumber: string, messageText: string): string {
  return `https://wa.me/${cleanWhatsAppNumber(whatsappNumber)}?text=${encodeURIComponent(messageText)}`;
}

/**
 * The order message. `orderNumber` is present once the order has been saved,
 * so the shop can match the chat to the admin record; it is simply left out
 * when saving failed and the customer is sent on with an unsaved message.
 *
 * Only fields that have a value are printed — no "SKU: N/A" filler.
 */
export function buildOrderMessage(
  lines: OrderLine[],
  opts: { orderNumber?: string; customerName?: string | null; notes?: string | null } = {}
): string {
  const out: string[] = ["Hello Prestige Tiles,", ""];

  out.push(
    opts.orderNumber
      ? `I would like to place an order (Ref: ${opts.orderNumber}):`
      : "I would like to place an order:"
  );
  out.push("");

  lines.forEach((l, i) => {
    out.push(`${i + 1}. *${l.name}*${l.brand ? ` — ${l.brand}` : ""}`);
    if (l.sku) out.push(`   Product code: ${l.sku}`);
    if (l.variantLabel) out.push(`   Variant: ${l.variantLabel}`);
    else {
      if (l.size) out.push(`   Size: ${l.size}`);
      if (l.finish) out.push(`   Finish: ${l.finish}`);
    }
    out.push(`   Quantity: ${l.quantity} ${l.unit || "Boxes"}`);
    if (l.productUrl) out.push(`   Link: ${l.productUrl}`);
    out.push("");
  });

  if (opts.customerName) out.push(`Name: ${opts.customerName}`, "");
  if (opts.notes) out.push(`Note: ${opts.notes}`, "");

  out.push("Please confirm availability and pricing.", "", "Thank you.");
  return out.join("\n");
}

// ————— Back-compat wrappers (existing call sites) —————

export interface SingleProductEnquiryInput {
  productName: string;
  sku?: string;
  variant?: string;
  size?: string;
  finish?: string;
  quantity?: number | string;
  unit?: string;
  price?: number | string;
  productUrl?: string;
  customNotes?: string;
}

export interface EnquiryListItem {
  id: string;
  name: string;
  sku?: string;
  size?: string;
  finish?: string;
  quantity: number;
  unit: string;
  price?: number;
  productUrl?: string;
}

export function generateSingleProductWhatsAppMessage(input: SingleProductEnquiryInput): string {
  return buildOrderMessage(
    [
      {
        name: input.productName,
        // The old call sites passed "N/A" for a missing SKU; never print that.
        sku: input.sku && input.sku !== "N/A" ? input.sku : null,
        variantLabel: input.variant,
        size: input.size,
        finish: input.finish,
        quantity: Number(input.quantity) || 1,
        unit: input.unit || "Boxes",
        productUrl: input.productUrl,
      },
    ],
    { notes: input.customNotes }
  );
}

export function generateMultiProductWhatsAppMessage(items: EnquiryListItem[]): string {
  return buildOrderMessage(
    items.map((i) => ({
      name: i.name,
      sku: i.sku,
      size: i.size,
      finish: i.finish,
      quantity: i.quantity,
      unit: i.unit,
      productUrl: i.productUrl,
    }))
  );
}
