"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MessageSquare, ArrowUpRight } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";

interface StickyProductCtaProps {
  name: string;
  brand: string;
  sku?: string;
  size?: string;
  whatsappNumber: string;
  /**
   * When the product has variants, a one-tap message would guess a size for the
   * customer. Send them to the order block (where they choose) instead.
   */
  hasVariants?: boolean;
}

export function StickyProductCta({
  name,
  brand,
  sku,
  size,
  whatsappNumber,
  hasVariants = false,
}: StickyProductCtaProps) {
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    function onScroll() {
      // Show sticky bar once user scrolls past the main hero CTA section (~500px)
      setVisible(window.scrollY > 520);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const skuStr = sku ? ` (Product No: ${sku})` : "";
  const sizeStr = size ? ` - Size: ${size}` : "";

  const href = hasVariants
    ? "#order-actions"
    : buildWhatsAppLink(
        whatsappNumber,
        `Hello Prestige Tiles,\n\nI am interested in:\n*${name}* (${brand})${skuStr}${sizeStr}\n\nPlease share pricing and availability.`
      );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduced ? false : { y: "100%" }}
          animate={{ y: 0 }}
          exit={reduced ? undefined : { y: "100%" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        >
          <div className="bg-canvas-inverse/95 text-white backdrop-blur-xl border-t border-white/10 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-float">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold tracking-tight text-white">
                  {name}
                </p>
                <p className="truncate text-[10px] uppercase tracking-widest text-gold">
                  {brand}
                </p>
              </div>

              <a
                href={href}
                {...(hasVariants ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                className="flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] px-5 py-2.5 text-xs font-bold text-white shadow-lg transition-transform active:scale-95 shrink-0"
              >
                <MessageSquare className="h-4 w-4 fill-current" />
                <span>{hasVariants ? "Choose & Order" : "Enquire on WhatsApp"}</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
