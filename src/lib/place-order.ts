"use client";

import { buildOrderMessage, buildWhatsAppLink, type OrderLine } from "@/lib/whatsapp-message";

export interface PlaceOrderItem {
  /** Product id (or slug for older saved list items). */
  productId: string;
  variantId?: string | null;
  size?: string | null;
  quantity: number;
  unit: string;
  /** Used only to build the fallback message if saving the order fails. */
  fallback: OrderLine;
}

export interface PlaceOrderResult {
  /** true when the order was saved and the message carries its reference. */
  saved: boolean;
  orderNumber?: string;
  /** Set when the server rejected something the customer can fix. */
  error?: string;
}

/**
 * Save the order, then open WhatsApp.
 *
 * The WhatsApp tab is opened synchronously inside the click handler and
 * pointed at the real link afterwards — mobile Safari and in-app browsers
 * block a window.open() that happens after an await. If saving the order
 * fails for a reason that is not the customer's to fix (network, server), they
 * still get sent to WhatsApp with an unsaved message: losing an order because
 * our database hiccuped would be worse than not having a record of it.
 */
export async function placeWhatsAppOrder(
  items: PlaceOrderItem[],
  whatsappNumber: string
): Promise<PlaceOrderResult> {
  const popup = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;

  const go = (url: string) => {
    if (popup && !popup.closed) popup.location.href = url;
    else window.location.assign(url);
  };

  const fallbackUrl = () =>
    buildWhatsAppLink(whatsappNumber, buildOrderMessage(items.map((i) => i.fallback)));

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map(({ productId, variantId, size, quantity, unit }) => ({
          productId,
          variantId: variantId || null,
          size: size || null,
          quantity,
          unit,
        })),
        sourcePage: window.location.pathname,
      }),
    });
    const data = await res.json().catch(() => null);

    if (res.ok && data?.whatsappUrl) {
      go(data.whatsappUrl);
      return { saved: true, orderNumber: data.orderNumber };
    }

    // 4xx = something the customer can fix (variant gone, bad quantity).
    // Close the blank tab and tell them rather than sending a wrong order.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      popup?.close();
      return { saved: false, error: data?.error || "Please check your order and try again." };
    }
  } catch {
    // network failure — fall through to the unsaved fallback
  }

  go(fallbackUrl());
  return { saved: false };
}
