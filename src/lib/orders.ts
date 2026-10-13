import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getWhatsAppOrderingNumber } from "@/lib/whatsapp";
import { buildOrderMessage, buildWhatsAppLink, ORDER_UNITS, type OrderLine } from "@/lib/whatsapp-message";

/**
 * Customer orders placed from the website and completed on WhatsApp.
 *
 * Deliberately NOT a cart/checkout: no payment, no automation, no chat
 * management. The only job here is to keep a trustworthy record of what the
 * customer asked for, then hand them to WhatsApp with a message that carries
 * the same details and an order reference.
 *
 * The client only sends *references* (product id/slug, variant id, quantity,
 * unit). Names, SKUs and variant labels are re-read from the database here, so
 * a tampered request cannot put arbitrary text under a real product.
 */

export { ORDER_STATUSES, type OrderStatus } from "@/lib/order-constants";

export const orderItemInputSchema = z.object({
  /** Product id, or slug for items saved before ids were carried in the list. */
  productId: z.string().min(1).max(200),
  variantId: z.string().min(1).max(200).optional().nullable(),
  /** Free-text size, used only when the product has no variant to point at. */
  size: z.string().max(80).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(100000),
  unit: z.enum(ORDER_UNITS).default("Boxes"),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, "Add at least one product").max(50),
  customerName: z.string().trim().max(100).optional().nullable(),
  customerPhone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s-]*$/, "Enter a valid phone number")
    .optional()
    .nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  sourcePage: z.string().max(300).optional().nullable(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** Thrown for problems the customer can act on (bad product, bad variant). */
export class OrderInputError extends Error {}

// No 0/O/1/I — an order reference gets read aloud and typed.
const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateOrderNumber(now = new Date()): string {
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  let tail = "";
  for (let i = 0; i < 4; i++) tail += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  return `PR-${yy}${mm}${dd}-${tail}`;
}

function variantLabelOf(v: { name: string | null; size: string | null; finish: string | null; color: string | null }) {
  if (v.name) return v.name;
  return [v.size, v.finish, v.color].filter(Boolean).join(" · ") || null;
}

export async function createOrder(rawInput: unknown, siteUrl: string) {
  const input = createOrderSchema.parse(rawInput);

  // Resolve every product in one query, by id or slug.
  const refs = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: {
      OR: [{ id: { in: refs } }, { slug: { in: refs } }],
      deletedAt: null,
      published: true,
      status: { notIn: ["DRAFT", "ARCHIVED"] },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      sku: true,
      productCode: true,
      finish: true,
      brand: { select: { name: true } },
      category: { select: { slug: true } },
      variants: {
        where: { active: true },
        select: { id: true, sku: true, name: true, size: true, finish: true, color: true },
      },
    },
  });

  const byRef = new Map<string, (typeof products)[number]>();
  for (const p of products) {
    byRef.set(p.id, p);
    byRef.set(p.slug, p);
  }

  const lines: (OrderLine & { productId: string; variantId: string | null })[] = [];

  for (const item of input.items) {
    const product = byRef.get(item.productId);
    if (!product) throw new OrderInputError("One of the products is no longer available. Please refresh and try again.");

    let variant: (typeof product.variants)[number] | undefined;
    if (item.variantId) {
      variant = product.variants.find((v) => v.id === item.variantId);
      // A variant id that does not belong to this product is never accepted —
      // that is exactly the wrong-product mix-up this guards against.
      if (!variant) throw new OrderInputError(`The selected variant of ${product.name} is no longer available.`);
    } else if (product.variants.length > 0) {
      throw new OrderInputError(`Please choose a variant of ${product.name}.`);
    }

    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      brand: product.brand?.name ?? null,
      sku: variant?.sku || product.sku || product.productCode || null,
      variantLabel: variant ? variantLabelOf(variant) : null,
      size: variant ? variant.size : item.size?.trim() || null,
      finish: variant ? variant.finish : product.finish || null,
      quantity: item.quantity,
      unit: item.unit,
      productUrl: product.category?.slug ? `${siteUrl}/products/${product.category.slug}/${product.slug}` : null,
    });
  }

  const whatsappNumber = await getWhatsAppOrderingNumber();

  // The reference is random, so a collision is possible but rare: retry a few
  // times on the unique constraint rather than failing the customer's order.
  let order: { id: string; orderNumber: string } | null = null;
  for (let attempt = 0; attempt < 4 && !order; attempt++) {
    try {
      order = await prisma.customerOrder.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerName: input.customerName || null,
          customerPhone: input.customerPhone || null,
          notes: input.notes || null,
          sourcePage: input.sourcePage || null,
          whatsappNumber,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              productName: l.name,
              brandName: l.brand ?? null,
              sku: l.sku ?? null,
              variantLabel: l.variantLabel ?? null,
              size: l.size ?? null,
              finish: l.finish ?? null,
              quantity: l.quantity,
              unit: l.unit,
              productUrl: l.productUrl ?? null,
            })),
          },
        },
        select: { id: true, orderNumber: true },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err; // only a duplicate reference is worth retrying
    }
  }
  if (!order) throw new Error("Could not allocate an order reference");

  const message = buildOrderMessage(lines, {
    orderNumber: order.orderNumber,
    customerName: input.customerName,
    notes: input.notes,
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    whatsappUrl: buildWhatsAppLink(whatsappNumber, message),
  };
}
