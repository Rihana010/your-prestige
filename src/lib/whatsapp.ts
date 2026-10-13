import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { business } from "@/lib/site-config";

// Pure builders live in a prisma-free module so client components can import
// them without bundling the database client. Re-exported for existing callers.
export * from "@/lib/whatsapp-message";

/**
 * Single source of truth for the active WhatsApp Ordering Number.
 * Falls back: setting "whatsapp.number" -> setting "business.whatsapp" -> site-config.
 */
export const getWhatsAppOrderingNumber = cache(async (): Promise<string> => {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "whatsapp.number" },
    });
    if (setting && typeof setting.value === "string" && setting.value.trim().length > 0) {
      return setting.value.trim();
    }
    const bizSetting = await prisma.setting.findUnique({
      where: { key: "business.whatsapp" },
    });
    if (bizSetting && typeof bizSetting.value === "string" && bizSetting.value.trim().length > 0) {
      return bizSetting.value.trim();
    }
  } catch {
    // Database fallback
  }
  return business.whatsapp;
});
