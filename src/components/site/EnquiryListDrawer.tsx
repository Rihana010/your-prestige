"use client";

import { useState } from "react";
import { useEnquiryList } from "@/lib/enquiry-store";
import { ORDER_UNITS } from "@/lib/whatsapp-message";
import { placeWhatsAppOrder } from "@/lib/place-order";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, ShoppingBag, Send, Plus, Minus, MessageSquare, Loader2 } from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";
import { toast } from "sonner";

interface EnquiryListDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  whatsappNumber: string;
}

const UNITS = ORDER_UNITS;

export function EnquiryListDrawer({ isOpen, onClose, whatsappNumber }: EnquiryListDrawerProps) {
  const { items, updateQuantity, updateUnit, removeItem, clearList } = useEnquiryList();
  const [sending, setSending] = useState(false);

  const handleSendWhatsApp = async () => {
    if (items.length === 0 || sending) return;
    setSending(true);

    // Track analytics event asynchronously
    try {
      fetch("/api/analytics/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "ENQUIRY_LIST_SENT",
          quantity: String(items.reduce((acc, i) => acc + i.quantity, 0)),
          sourcePage: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      }).catch(() => {});
    } catch {}

    const result = await placeWhatsAppOrder(
      items.map((i) => ({
        // Items saved before variants existed have no productId — their id was the product.
        productId: i.productId || i.id,
        variantId: i.variantId,
        size: i.size,
        quantity: i.quantity,
        unit: i.unit,
        fallback: {
          name: i.name,
          brand: i.brand,
          sku: i.sku,
          variantLabel: i.variantLabel,
          size: i.size,
          finish: i.finish,
          quantity: i.quantity,
          unit: i.unit,
          productUrl: i.productUrl,
        },
      })),
      whatsappNumber
    );

    if (result.error) toast.error(result.error);
    else if (result.orderNumber) {
      toast.success(`Order ${result.orderNumber} saved — finish it on WhatsApp`);
      clearList();
      onClose();
    }
    setSending(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Drawer Slide-in */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-[#141413] text-white shadow-2xl border-l border-white/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-white">Enquiry List</h2>
                  <p className="text-xs text-white/40">{items.length} items ready for WhatsApp</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="rounded-full p-3 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close Enquiry List"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-white/30">
                    <MessageSquare className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-medium text-white/60">Your Enquiry List is empty</p>
                  <p className="text-xs text-white/40 max-w-xs">
                    Browse tile collections and click &quot;Add to Enquiry List&quot; to build a multi-product enquiry.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3.5 transition-colors hover:border-gold/30"
                  >
                    {/* Thumbnail */}
                    {item.image ? (
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-black/30 border border-white/10">
                        <SafeImage src={item.image} alt={item.name} fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs text-white/30 font-mono">
                        TILE
                      </div>
                    )}

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="truncate text-sm font-semibold text-white">{item.name}</h3>
                          <p className="text-xs text-white/40">{[item.variantLabel || item.size, item.sku].filter(Boolean).join(" · ") || "Standard"}</p>
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-white/30 transition-colors hover:text-red-400 p-2"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Quantity & Unit controls */}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 border border-white/10 rounded-lg bg-white/5 px-2 py-1">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="text-white/60 hover:text-white p-1"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-mono font-bold text-gold">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="text-white/60 hover:text-white p-1"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <select
                          value={item.unit}
                          onChange={(e) => updateUnit(item.id, e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:border-gold outline-none"
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u} className="bg-[#1c1c1b] text-white">
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-white/10 p-6 space-y-3 bg-[#171716]">
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>Total Selected Products</span>
                  <span className="font-bold text-white">{items.length} Items</span>
                </div>

                <button
                  onClick={handleSendWhatsApp}
                  disabled={sending}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-5 py-4 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed min-h-[50px]"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving your order...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Order on WhatsApp
                    </>
                  )}
                </button>

                <button
                  onClick={clearList}
                  className="w-full text-center text-xs text-white/30 hover:text-white/60 pt-1"
                >
                  Clear entire list
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
