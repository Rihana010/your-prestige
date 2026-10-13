/** Client-safe order constants (no database imports) — shared by the server code and the admin UI. */
export const ORDER_STATUSES = ["NEW", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
