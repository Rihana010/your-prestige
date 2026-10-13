import type { Role } from "@prisma/client";

/**
 * Pure, client-safe permission matrix — no server-only imports here.
 * Kept separate from rbac.ts's requirePermission() (which needs auth()
 * from @/lib/auth, a Node-only module) so client components like Sidebar
 * can import `can()` without pulling next/headers into the client bundle.
 */

export type Module =
  | "dashboard"
  | "homepage"
  | "products"
  | "catalogImports"
  | "landingPages"
  | "categories"
  | "collections"
  | "brands"
  | "portfolio"
  | "showrooms"
  | "gallery"
  | "videos"
  | "testimonials"
  | "blog"
  | "faqs"
  | "offers"
  | "leads"
  | "bookings"
  | "orders"
  | "conversations"
  | "media"
  | "seo"
  | "users"
  | "settings"
  | "maintenance"
  | "analytics"
  | "logs"
  | "dealers"
  | "reviews"
  | "reports"
  | "inventory"
  | "attributes"
  | "specifications"
  | "aboutPeople";

export type Action = "view" | "create" | "edit" | "delete" | "publish" | "settings" | "analytics";

const ALL_MODULES: Module[] = [
  "dashboard", "homepage", "products", "catalogImports", "landingPages",
  "categories", "collections", "brands", "portfolio",
  "showrooms", "gallery", "videos", "testimonials", "blog", "faqs", "offers", "leads",
  "bookings", "orders", "conversations", "media", "seo", "users", "settings",
  "maintenance", "analytics", "logs",
  "dealers", "reviews", "reports", "inventory", "attributes", "specifications", "aboutPeople",
];

const ALL_ACTIONS: Action[] = ["view", "create", "edit", "delete", "publish", "settings", "analytics"];

/** Everything a manager runs day-to-day: catalogue, content and depot. */
const MANAGER_MODULES: Module[] = ALL_MODULES.filter(
  (m) => !(["users", "settings", "maintenance"] as Module[]).includes(m)
);

const FULL: Action[] = ["view", "create", "edit", "delete", "publish"];

/**
 * Coarse-grained permission matrix keyed by the 6 depot roles. This is a
 * pragmatic, code-defined matrix rather than a fully dynamic DB-backed
 * permission system — granular enough to gate every module/action pair the
 * spec asks for, without an extra Permission/RolePermission subsystem.
 *
 * NOTE — these roles replaced the CMS's original content-team roles (OWNER,
 * MARKETING, CONTENT, SEO, SUPPORT) when the inventory app took ownership of
 * the shared `Role` enum. The grants below are deliberately **least
 * privilege**: where the old capability had no obvious depot equivalent it was
 * dropped rather than guessed at, so a mis-mapping locks someone out instead
 * of handing them access they shouldn't have. Widen these once the intended
 * per-role capabilities are confirmed.
 */
const MATRIX: Record<Role, Partial<Record<Module, Action[]>>> = {
  SUPER_ADMIN: Object.fromEntries(ALL_MODULES.map((m) => [m, ALL_ACTIONS])),

  // Runs the business — full catalogue, content and depot control, but not
  // account management or platform settings.
  MANAGER: Object.fromEntries(
    MANAGER_MODULES.map((m) => [m, [...FULL, "analytics"] as Action[]])
  ),

  // Owns one showroom floor: approves the blocks their staff raise, and works
  // the customer pipeline. Read-only on the catalogue itself.
  SHOWROOM_INCHARGE: {
    dashboard: ["view", "analytics"],
    products: ["view"],
    categories: ["view"],
    collections: ["view"],
    brands: ["view"],
    inventory: ["view", "create", "edit"],
    dealers: ["view"],
    showrooms: ["view", "edit"],
    leads: ["view", "create", "edit"],
    bookings: ["view", "create", "edit"],
    orders: ["view", "edit"],
    reports: ["view"],
    analytics: ["view", "analytics"],
  },

  // Serves customers and raises blocks; cannot approve their own.
  SHOWROOM_STAFF: {
    dashboard: ["view"],
    products: ["view"],
    categories: ["view"],
    collections: ["view"],
    brands: ["view"],
    inventory: ["view", "create"],
    showrooms: ["view"],
    leads: ["view", "create", "edit"],
    bookings: ["view", "create", "edit"],
    orders: ["view", "edit"],
  },

  // External account. Sees the catalogue and what it can block — nothing
  // internal. The public site publishes no stock figures at all; this only
  // gates the admin surface.
  DEALER: {
    dashboard: ["view"],
    products: ["view"],
    categories: ["view"],
    collections: ["view"],
    brands: ["view"],
    inventory: ["view"],
  },

  VIEWER: Object.fromEntries(ALL_MODULES.map((m) => [m, ["view"]])),
};

export function can(role: Role, module: Module, action: Action): boolean {
  return MATRIX[role]?.[module]?.includes(action) ?? false;
}

export function permissionsFor(role: Role): Partial<Record<Module, Action[]>> {
  return MATRIX[role] ?? {};
}
