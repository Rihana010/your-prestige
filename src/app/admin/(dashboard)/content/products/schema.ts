import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(150),
  slug: z
    .string()
    .min(2)
    .max(150)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  /** Our/ manufacturer's product code. Unique across live products when set. */
  sku: z.string().trim().max(80).optional().or(z.literal("")),
  /** Manufacturer article code, when different from the SKU. */
  productCode: z.string().trim().max(80).optional().or(z.literal("")),
  collection: z.string().max(150).optional().or(z.literal("")),
  description: z.string().max(4000).optional().or(z.literal("")),
  finish: z.string().max(100).optional().or(z.literal("")),
  thickness: z.string().max(50).optional().or(z.literal("")),
  sizes: z.array(z.string()).default([]),
  material: z.string().max(100).optional().or(z.literal("")),
  color: z.string().max(100).optional().or(z.literal("")),
  texture: z.string().max(150).optional().or(z.literal("")),
  applications: z.array(z.string()).default([]),
  lifestyleImage: z.string().optional().or(z.literal("")),
  textureImage: z.string().optional().or(z.literal("")),
  images: z.array(z.string()).default([]),
  video: z.string().optional().or(z.literal("")),
  brochureUrl: z.string().optional().or(z.literal("")),
  tag: z.string().max(50).optional().or(z.literal("")),
  aspect: z.enum(["portrait", "square", "landscape"]).default("square"),
  relatedIds: z.array(z.string()).default([]),
  categoryId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  collectionId: z.string().optional().nullable(),
  featured: z.boolean().default(false),
  designerPick: z.boolean().default(false),
  published: z.boolean().default(true),
  /**
   * The one field that removes a product from the public site — see
   * `PUBLIC_PRODUCT_WHERE` in `lib/products.ts`. `published` above is kept in
   * lockstep with this (true only for ACTIVE) purely so any other code still
   * reading the plain boolean stays correct; the form only ever presents this
   * single three-way control, never both.
   */
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).default("ACTIVE"),
  priceIndicator: z.string().max(10).optional().or(z.literal("")),
});

export type ProductInput = z.infer<typeof productSchema>;
