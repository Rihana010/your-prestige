import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  description: z.string().max(2000).optional().or(z.literal("")),
  image: z.string().optional().or(z.literal("")),
  bannerImage: z.string().optional().or(z.literal("")),
  icon: z.string().max(50).optional().or(z.literal("")),
  /** Optional showcase video + poster. Categories work fine without either. */
  video: z.string().optional().or(z.literal("")),
  videoPoster: z.string().optional().or(z.literal("")),
  /** Owning brand. Empty = shared across brands (the pre-existing behaviour). */
  brandId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  published: z.boolean().default(true),
});

export type CategoryInput = z.infer<typeof categorySchema>;
