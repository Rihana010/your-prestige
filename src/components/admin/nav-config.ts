import {
  LayoutDashboard, Home, Package, Tags, Award, Briefcase, Images, Video,
  MessageSquareQuote, PenSquare, HelpCircle, BadgePercent, Users2, CalendarClock,
  Bot, FolderOpen, Search, ShieldCheck, BarChart3, Settings, Wrench, ScrollText, ClipboardCheck,
  Store, FileStack, MapPin, MessageSquarePlus, MessageSquare, Building2,
  FileSpreadsheet, Warehouse, Star, LineChart, SlidersHorizontal, Layers, Activity, ShoppingBag,
} from "lucide-react";

import type { Module } from "@/lib/permissions";
import type { Role } from "@prisma/client";

/**
 * Single source of truth for admin navigation, shared by the desktop sidebar
 * and the mobile drawer so the two can never drift apart.
 */
export const adminNav = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, module: "dashboard" as Module },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3, module: "analytics" as Module },
      { label: "Reports", href: "/admin/reports", icon: LineChart, module: "reports" as Module },
    ],
  },
  {
    section: "Commerce & Operations",
    items: [
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag, module: "orders" as Module },
      { label: "WhatsApp Commerce", href: "/admin/whatsapp", icon: MessageSquare, module: "settings" as Module },
      { label: "Dealers", href: "/admin/dealers", icon: Building2, module: "dealers" as Module },
      { label: "Inventory", href: "/admin/inventory", icon: Warehouse, module: "inventory" as Module },
      { label: "Reviews", href: "/admin/reviews", icon: Star, module: "reviews" as Module },
    ],
  },
  {
    section: "Catalog & PIM",
    items: [
      { label: "Products", href: "/admin/content/products", icon: Package, module: "products" as Module },
      { label: "Image Review", href: "/admin/content/image-review", icon: Images, module: "products" as Module },
      { label: "Classification", href: "/admin/content/classification", icon: SlidersHorizontal, module: "products" as Module },
      { label: "Catalog Imports", href: "/admin/content/catalog-imports", icon: FileStack, module: "catalogImports" as Module },
      { label: "Excel Import", href: "/admin/content/excel-import", icon: FileSpreadsheet, module: "catalogImports" as Module },
      { label: "Categories", href: "/admin/content/categories", icon: Tags, module: "categories" as Module },
      { label: "Collections", href: "/admin/content/collections", icon: Layers, module: "collections" as Module },
      { label: "Brands", href: "/admin/content/brands", icon: Award, module: "brands" as Module },
      { label: "Attributes & Specs", href: "/admin/attributes", icon: SlidersHorizontal, module: "attributes" as Module },
      { label: "Showrooms", href: "/admin/content/showrooms", icon: Store, module: "showrooms" as Module },
      { label: "Homepage", href: "/admin/content/homepage", icon: Home, module: "homepage" as Module },
      { label: "Portfolio", href: "/admin/content/portfolio", icon: Briefcase, module: "portfolio" as Module },
      { label: "Gallery", href: "/admin/content/gallery", icon: Images, module: "gallery" as Module },
      { label: "Videos", href: "/admin/content/videos", icon: Video, module: "videos" as Module },
      { label: "Testimonials", href: "/admin/content/testimonials", icon: MessageSquareQuote, module: "testimonials" as Module },
      { label: "Blog", href: "/admin/content/blog", icon: PenSquare, module: "blog" as Module },
      { label: "FAQs", href: "/admin/content/faqs", icon: HelpCircle, module: "faqs" as Module },
      { label: "Offers", href: "/admin/content/offers", icon: BadgePercent, module: "offers" as Module },
      { label: "Landing Pages", href: "/admin/content/landing-pages", icon: MapPin, module: "landingPages" as Module },
      { label: "People & Guests", href: "/admin/content/about-people", icon: Users2, module: "aboutPeople" as Module },
    ],
  },
  {
    section: "Growth & CRM",
    items: [
      { label: "Leads", href: "/admin/leads", icon: Users2, module: "leads" as Module },
      { label: "Bookings", href: "/admin/bookings", icon: CalendarClock, module: "bookings" as Module },
      { label: "AI Conversations", href: "/admin/conversations", icon: Bot, module: "conversations" as Module },
      { label: "Google Posts", href: "/admin/content/google-posts", icon: MessageSquarePlus, module: "showrooms" as Module },
    ],
  },
  {
    section: "System & Storage",
    items: [
      { label: "Media Library", href: "/admin/media", icon: FolderOpen, module: "media" as Module },
      { label: "Media Health Check", href: "/admin/media/health", icon: Activity, module: "media" as Module },
      { label: "SEO Engine", href: "/admin/seo", icon: Search, module: "seo" as Module },
      { label: "SEO Audit", href: "/admin/seo/audit", icon: ClipboardCheck, module: "seo" as Module },
      { label: "Users & Roles", href: "/admin/users", icon: ShieldCheck, module: "users" as Module },
      { label: "Settings", href: "/admin/settings", icon: Settings, module: "settings" as Module },
      { label: "Maintenance", href: "/admin/maintenance", icon: Wrench, module: "maintenance" as Module },
      { label: "Logs", href: "/admin/logs", icon: ScrollText, module: "logs" as Module },
    ],
  },
] as const;

export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  SHOWROOM_INCHARGE: "Showroom In-Charge",
  SHOWROOM_STAFF: "Showroom Staff",
  DEALER: "Dealer",
  VIEWER: "Viewer",
};

/** Marks the nav item matching the current path (dashboard is exact-match). */
export function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}
