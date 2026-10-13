"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AField, ATextArea, ASelect, AToggle } from "@/components/admin/FormField";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { VideoUploadField } from "@/components/admin/VideoUploadField";
import { categorySchema, type CategoryInput } from "./schema";
import { createCategory, updateCategory, getCategoryOptions, getBrandOptions } from "./actions";
import type { CategoryRow } from "./actions";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const empty: CategoryInput = {
  name: "",
  slug: "",
  description: "",
  image: "",
  bannerImage: "",
  icon: "",
  video: "",
  videoPoster: "",
  brandId: null,
  parentId: null,
  sortOrder: 0,
  published: true,
};

export function CategoryForm({
  category,
  onSuccess,
}: {
  category: CategoryRow | null;
  onSuccess: () => void;
}) {
  const [values, setValues] = useState<CategoryInput>(
    category
      ? {
          name: category.name,
          slug: category.slug,
          description: category.description ?? "",
          image: category.image ?? "",
          bannerImage: category.bannerImage ?? "",
          icon: category.icon ?? "",
          video: category.video ?? "",
          videoPoster: category.videoPoster ?? "",
          brandId: category.brandId,
          parentId: category.parentId,
          sortOrder: category.sortOrder,
          published: category.published,
        }
      : empty
  );
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [parentOptions, setParentOptions] = useState<{ id: string; name: string; brandId: string | null }[]>([]);
  const [brandOptions, setBrandOptions] = useState<{ id: string; name: string; slug: string }[]>([]);

  useEffect(() => {
    getCategoryOptions(category?.id).then(setParentOptions);
    getBrandOptions().then(setBrandOptions);
  }, [category?.id]);

  // A brand's category can only sit under a shared category or one of the same
  // brand; the server enforces it, this just stops offering the wrong choices.
  const selectedParent = parentOptions.find((p) => p.id === values.parentId);
  const visibleParents = parentOptions.filter((p) => !values.brandId || !p.brandId || p.brandId === values.brandId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = categorySchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (category) {
        await updateCategory(category.id, parsed.data);
        toast.success("Category updated");
      } else {
        await createCategory(parsed.data);
        toast.success("Category created");
      }
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <AField
        label="Name"
        required
        value={values.name}
        onChange={(e) => {
          const name = e.target.value;
          setValues((v) => ({ ...v, name, slug: slugTouched ? v.slug : slugify(name) }));
        }}
        error={errors.name}
      />
      <AField
        label="Slug"
        required
        value={values.slug}
        onChange={(e) => {
          setSlugTouched(true);
          setValues((v) => ({ ...v, slug: e.target.value }));
        }}
        error={errors.slug}
        hint="Used in the URL — lowercase, hyphens only"
      />
      <ATextArea
        label="Description"
        value={values.description}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        error={errors.description}
      />
      <ImageUploadField scope="categories" ownerId={category?.id ?? null}
        label="Card Image"
        value={values.image || null}
        onChange={(url) => setValues((v) => ({ ...v, image: url ?? "" }))}
      />
      <ImageUploadField scope="categories" ownerId={category?.id ?? null}
        label="Banner Image"
        value={values.bannerImage || null}
        onChange={(url) => setValues((v) => ({ ...v, bannerImage: url ?? "" }))}
        aspect="aspect-[21/9]"
      />
      <VideoUploadField
        scope="categories"
        ownerId={category?.id ?? null}
        label="Showcase Video (optional)"
        value={values.video || null}
        onChange={(url) => setValues((v) => ({ ...v, video: url ?? "" }))}
      />
      <ImageUploadField scope="categories" ownerId={category?.id ?? null}
        label="Video Poster (optional)"
        value={values.videoPoster || null}
        onChange={(url) => setValues((v) => ({ ...v, videoPoster: url ?? "" }))}
        aspect="aspect-video"
      />
      <p className="text-xs text-white/35">
        Image and video are both optional — without them the category page shows a clean text header.
      </p>
      <AField
        label="Icon"
        value={values.icon}
        onChange={(e) => setValues((v) => ({ ...v, icon: e.target.value }))}
        hint="Lucide icon name, e.g. 'grid', 'droplet', 'sparkles'"
      />
      <ASelect
        label="Brand"
        value={selectedParent?.brandId ?? values.brandId ?? ""}
        disabled={!!selectedParent?.brandId}
        onChange={(e) => setValues((v) => ({ ...v, brandId: e.target.value || null }))}
        hint={
          selectedParent?.brandId
            ? "Inherited from the parent category."
            : "Leave empty to share this category across all brands. Slugs are global, so a brand-specific category usually needs the brand in its slug (e.g. jaquar-faucets)."
        }
      >
        <option value="">Shared across brands</option>
        {brandOptions.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </ASelect>
      <ASelect
        label="Parent Category"
        value={values.parentId ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, parentId: e.target.value || null }))}
      >
        <option value="">None (top-level)</option>
        {visibleParents.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </ASelect>
      <AField
        label="Sort Order"
        type="number"
        value={values.sortOrder}
        onChange={(e) => setValues((v) => ({ ...v, sortOrder: Number(e.target.value) }))}
      />
      <AToggle
        label="Published"
        checked={values.published}
        onChange={(published) => setValues((v) => ({ ...v, published }))}
      />
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-gold py-3 text-sm font-semibold text-ivory transition-colors hover:bg-gold-deep disabled:opacity-60"
      >
        {saving ? "Saving…" : category ? "Save Changes" : "Create Category"}
      </button>
    </form>
  );
}
