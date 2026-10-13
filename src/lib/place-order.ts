"use client";

import {
  buildOrderMessage,
  buildWhatsAppLink,
  type OrderLine,
} from "@/lib/whatsapp-message";

export interface PlaceOrderItem {
  productId: string;
  variantId?: string | null;
  size?: string | null;
  quantity: number;
  unit: string;
  fallback: OrderLine;
}

export interface PlaceOrderResult {
  saved: boolean;
  orderNumber?: string;
  error?: string;
}

export async function placeWhatsAppOrder(
  items: PlaceOrderItem[],
  whatsappNumber: string
): Promise<PlaceOrderResult> {
  // Prepare a fallback link in case saving the order fails.
  const fallbackUrl = buildWhatsAppLink(
    whatsappNumber,
    buildOrderMessage(items.map((item) => item.fallback))
  );

  // Open exactly one blank tab during the user's click.
  // This preserves the browser's permission to open a new tab.
  const popup = window.open("about:blank", "_blank");

  // Keep the original product page in the current tab.
  if (popup) {
    popup.opener = null;
  }

  const openWhatsApp = (url: string) => {
    if (popup && !popup.closed) {
      popup.location.href = url;
    } else {
      // If the browser blocks popups, do not redirect the product page.
      // Show the WhatsApp link as an error instead.
      return false;
    }

    return true;
  };

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: items.map(
          ({ productId, variantId, size, quantity, unit }) => ({
            productId,
            variantId: variantId || null,
            size: size || null,
            quantity,
            unit,
          })
        ),
        sourcePage: window.location.pathname,
      }),
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data?.whatsappUrl) {
      const opened = openWhatsApp(data.whatsappUrl);

      if (!opened) {
        return {
          saved: true,
          orderNumber: data.orderNumber,
          error:
            "Your order was saved, but the browser blocked the WhatsApp tab. Allow popups and try opening WhatsApp again.",
        };
      }

      return {
        saved: true,
        orderNumber: data.orderNumber,
      };
    }

    // Close the blank tab when the server rejects the order.
    if (popup && !popup.closed) {
      popup.close();
    }

    return {
      saved: false,
      error:
        data?.error ||
        "Could not save your order. Please refresh and try again.",
    };
  } catch {
    // Do not open a second tab or redirect the original product page.
    if (popup && !popup.closed) {
      popup.close();
    }

    return {
      saved: false,
      error:
        "Could not save your order. Please check your connection and try again.",
    };
  }
}