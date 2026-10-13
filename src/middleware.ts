import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { can, type Module } from "@/lib/permissions";
import type { Role } from "@prisma/client";

const { auth } = NextAuth(authConfig);

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/accept-invite", "/admin/reset-password"];

/** Admin pages that carry no module of their own and only need a session. */
const UNGATED_ADMIN_PATHS = ["/admin/forbidden"];

/**
 * Which permission module owns each admin route.
 *
 * Authentication alone used to be the whole admin gate: any signed-in
 * account could open /admin/users, /admin/settings or /admin/logs by typing
 * the URL, because the sidebar merely hid the links and most pages ran no
 * server-side check. Longest prefix wins, so nested routes inherit their
 * section unless listed explicitly.
 */
const ROUTE_MODULES: ReadonlyArray<readonly [string, Module]> = [
  ["/admin/analytics", "analytics"],
  ["/admin/reports", "reports"],
  ["/admin/whatsapp", "settings"],
  ["/admin/dealers", "dealers"],
  ["/admin/inventory", "inventory"],
  ["/admin/reviews", "reviews"],
  ["/admin/attributes", "attributes"],
  ["/admin/leads", "leads"],
  ["/admin/bookings", "bookings"],
  ["/admin/orders", "orders"],
  ["/admin/conversations", "conversations"],
  ["/admin/media", "media"],
  ["/admin/seo", "seo"],
  ["/admin/users", "users"],
  ["/admin/settings", "settings"],
  ["/admin/maintenance", "maintenance"],
  ["/admin/logs", "logs"],
  ["/admin/content/products", "products"],
  ["/admin/content/classification", "products"],
  ["/admin/content/catalog-imports", "catalogImports"],
  ["/admin/content/excel-import", "catalogImports"],
  ["/admin/content/categories", "categories"],
  ["/admin/content/collections", "collections"],
  ["/admin/content/brands", "brands"],
  ["/admin/content/showrooms", "showrooms"],
  ["/admin/content/homepage", "homepage"],
  ["/admin/content/portfolio", "portfolio"],
  ["/admin/content/gallery", "gallery"],
  ["/admin/content/videos", "videos"],
  ["/admin/content/testimonials", "testimonials"],
  ["/admin/content/blog", "blog"],
  ["/admin/content/faqs", "faqs"],
  ["/admin/content/offers", "offers"],
  ["/admin/content/landing-pages", "landingPages"],
  ["/admin/content/about-people", "aboutPeople"],
  ["/admin/content/google-posts", "showrooms"],
  ["/admin", "dashboard"],
];

function moduleForPath(pathname: string): Module | null {
  let best: { prefix: string; module: Module } | null = null;
  for (const [prefix, mod] of ROUTE_MODULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.prefix.length) best = { prefix, module: mod };
    }
  }
  return best?.module ?? null;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;
  const isPublicAdminPath = PUBLIC_ADMIN_PATHS.includes(pathname);
  const isAdminApi = pathname.startsWith("/api/admin");

  if (isPublicAdminPath) {
    if (isLoggedIn && pathname === "/admin/login") {
      return NextResponse.redirect(new URL("/admin", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    if (isAdminApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/admin/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Route-level authorization. API handlers under /api/admin run their own
  // requirePermission() against the module they actually touch, so they are
  // left to it rather than gated twice with a map that could drift.
  if (!isAdminApi && !UNGATED_ADMIN_PATHS.includes(pathname)) {
    const required = moduleForPath(pathname);
    const role = req.auth?.user?.role as Role | undefined;
    if (required && role && !can(role, required, "view")) {
      const denied = new URL("/admin/forbidden", req.nextUrl);
      denied.searchParams.set("module", required);
      denied.searchParams.set("from", pathname);
      return NextResponse.redirect(denied);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
