"use client";

import { useState } from "react";
import {
  generateSingleProductWhatsAppMessage,
  buildWhatsAppLink,
} from "@/lib/whatsapp";
import { useEnquiryList } from "@/lib/enquiry-store";
import {
  ArrowUpRight,
  Plus,
  Minus,
  ShoppingBag,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { CatalogProduct } from "@/lib/catalog";

interface Props {
  product: CatalogProduct;
  whatsappNumber: string;
}

const UNITS = ["Boxes", "Pieces", "Sq.ft", "Sq.m"];

export function ProductWhatsAppActions({
  product,
  whatsappNumber,
}: Props) {
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("Boxes");
  const [selectedSize, setSelectedSize] = useState(
    product.sizes[0] || "Standard"
  );
  const [ordering, setOrdering] = useState(false);
  const [adding, setAdding] = useState(false);

  const { addItem } = useEnquiryList();

  const handleOrderWhatsApp = () => {
    if (ordering) return;

    setOrdering(true);

    const message = generateSingleProductWhatsAppMessage({
      productName: product.name,
      sku: product.sku || "N/A",
      size: selectedSize,
      finish: product.finish,
      quantity,
      unit,
      productUrl: window.location.href,
    });

    const link = buildWhatsAppLink(whatsappNumber, message);

    fetch("/api/analytics/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "PRODUCT_CLICK",
        productId: product.id || product.slug,
        productName: product.name,
        quantity,
        unit,
        sourcePage: window.location.pathname,
      }),
    }).catch(() => {});

    toast.success("Opening WhatsApp with your pre-filled enquiry...");

    // Open the tab immediately within the click handler.
    const whatsappWindow = window.open("about:blank", "_blank");

    if (whatsappWindow) {
      whatsappWindow.opener = null;
      whatsappWindow.location.href = link;
    } else {
      // Fall back to the current tab if popups are blocked.
      window.location.href = link;
    }

    setOrdering(false);
  };

  const handleAddToEnquiryList = () => {
    if (adding) return;

    setAdding(true);

    addItem({
      id: product.id || product.slug,
      name: product.name,
      sku: product.sku,
      size: selectedSize,
      finish: product.finish,
      quantity,
      unit,
      image: product.lifestyleImage,
    });

    toast.success(
      `Added ${quantity} ${unit} of ${product.name} to Enquiry List!`
    );

    setTimeout(() => {
      setAdding(false);
    }, 400);
  };

  return (
    <div className="max-w-xl space-y-4">
      {/* Quantity, unit and size selectors */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-md">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="text-white/70 transition-colors hover:text-white"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>

          <span className="w-8 text-center font-mono text-sm font-bold text-gold">
            {quantity}
          </span>

          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="text-white/70 transition-colors hover:text-white"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-gold"
          aria-label="Select order unit"
        >
          {UNITS.map((u) => (
            <option key={u} value={u} className="bg-[#141413] text-white">
              {u}
            </option>
          ))}
        </select>

        {product.sizes.length > 1 && (
          <select
            value={selectedSize}
            onChange={(e) => setSelectedSize(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-gold"
            aria-label="Select product size"
          >
            {product.sizes.map((s) => (
              <option key={s} value={s} className="bg-[#141413] text-white">
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Primary action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleOrderWhatsApp}
          disabled={ordering || adding}
          className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-4 text-sm font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ordering ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Preparing WhatsApp...
            </>
          ) : (
            <>
              <MessageSquare className="h-5 w-5" />
              Order on WhatsApp
              <ArrowUpRight className="h-4 w-4" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleAddToEnquiryList}
          disabled={ordering || adding}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-4 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {adding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" />
              Add to Enquiry List
            </>
          )}
        </button>
      </div>
    </div>
  );
}