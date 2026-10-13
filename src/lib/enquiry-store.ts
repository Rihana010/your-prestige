"use client";

import { useState, useEffect } from "react";

export interface EnquiryItem {
  /**
   * List key. Unique per product + variant (or size), so the same product in
   * two sizes is two lines, not one merged line. Items saved before this
   * change used the bare product id here and keep working.
   */
  id: string;
  /** The product itself (id or slug). Absent on items saved by older versions — then `id` is the product. */
  productId?: string;
  variantId?: string;
  variantLabel?: string;
  brand?: string;
  name: string;
  sku?: string;
  size?: string;
  finish?: string;
  quantity: number;
  unit: string; // Boxes | Pieces | Sq.ft | Sq.m
  price?: number;
  image?: string;
  productUrl?: string;
}

const STORAGE_KEY = "prestige_enquiry_list";

/** Stable list key for a product + the variant (or size) chosen for it. */
export function enquiryKey(productRef: string, variantId?: string | null, size?: string | null): string {
  return `${productRef}::${variantId || size || ""}`;
}

export function getStoredEnquiryList(): EnquiryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveStoredEnquiryList(items: EnquiryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("enquiry-list-updated"));
  } catch {
    // Storage error ignored
  }
}

export function useEnquiryList() {
  const [items, setItems] = useState<EnquiryItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setItems(getStoredEnquiryList());

    const handleUpdate = () => {
      setItems(getStoredEnquiryList());
    };

    window.addEventListener("enquiry-list-updated", handleUpdate);
    return () => window.removeEventListener("enquiry-list-updated", handleUpdate);
  }, []);

  const addItem = (newItem: Omit<EnquiryItem, "quantity"> & { quantity?: number }) => {
    const current = getStoredEnquiryList();
    const existingIndex = current.findIndex((i) => i.id === newItem.id);

    const qty = newItem.quantity || 1;

    let updated: EnquiryItem[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + qty,
        unit: newItem.unit || updated[existingIndex].unit || "Boxes",
      };
    } else {
      updated = [...current, { ...newItem, quantity: qty, unit: newItem.unit || "Boxes" }];
    }

    saveStoredEnquiryList(updated);
    setIsOpen(true);
  };

  const updateQuantity = (id: string, quantity: number) => {
    const current = getStoredEnquiryList();
    if (quantity <= 0) {
      saveStoredEnquiryList(current.filter((i) => i.id !== id));
      return;
    }
    const updated = current.map((i) => (i.id === id ? { ...i, quantity } : i));
    saveStoredEnquiryList(updated);
  };

  const updateUnit = (id: string, unit: string) => {
    const current = getStoredEnquiryList();
    const updated = current.map((i) => (i.id === id ? { ...i, unit } : i));
    saveStoredEnquiryList(updated);
  };

  const removeItem = (id: string) => {
    const current = getStoredEnquiryList();
    saveStoredEnquiryList(current.filter((i) => i.id !== id));
  };

  const clearList = () => {
    saveStoredEnquiryList([]);
  };

  return {
    items,
    itemCount: items.length,
    isOpen,
    setIsOpen,
    addItem,
    updateQuantity,
    updateUnit,
    removeItem,
    clearList,
  };
}
