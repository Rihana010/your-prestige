"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, Star, Trash2, FolderInput, Eye, EyeOff } from "lucide-react";
import { useAdminList } from "@/hooks/useAdminList";
import { AdminDataTable, type Column } from "@/components/admin/AdminDataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Drawer } from "@/components/admin/Drawer";
import { ProductForm } from "./ProductForm";
import { cn } from "@/lib/utils";
import {
  listProducts, softDeleteProduct, restoreProduct, bulkDeleteProducts,
  bulkAssignProducts, bulkSetProductStatus, getProductFormOptions,
  type ProductRow,
} from "./actions";

const selectCls =
  "h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-medium text-white/80 focus:border-gold focus:outline-none";

export function ProductsManager({ permissions }: { permissions: { create: boolean; edit: boolean; delete: boolean } }) {
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [unassigned, setUnassigned] = useState(false);
  const [opts, setOpts] = useState<{
    brands: { id: string; name: string }[];
    categories: { id: string; name: string; brandId: string | null }[];
  }>({ brands: [], categories: [] });
  useEffect(() => {
    getProductFormOptions().then((o) => setOpts({ brands: o.brands, categories: o.categories }));
  }, []);

  const list = useAdminList<ProductRow>(
    (p) => listProducts({ ...p, brandId: brandId || undefined, categoryId: categoryId || undefined, status: status || undefined, unassigned }),
    { deps: [brandId, categoryId, status, unassigned] }
  );
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBrand, setAssignBrand] = useState("");
  const [assignCategory, setAssignCategory] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);

  // A selection made under one filter must not silently apply to another.
  useEffect(() => {
    setSelected(new Set());
  }, [brandId, categoryId, status, unassigned, list.page, list.search, list.trash]);

  async function handleBulkAssign() {
    if (!assignBrand && !assignCategory) {
      toast.error("Choose a brand, a category, or both.");
      return;
    }
    setAssigning(true);
    try {
      const res = await bulkAssignProducts(Array.from(selected), {
        ...(assignBrand ? { brandId: assignBrand } : {}),
        ...(assignCategory ? { categoryId: assignCategory } : {}),
      });
      toast.success(`${res.updated} product${res.updated === 1 ? "" : "s"} updated`);
      setSelected(new Set());
      setAssignOpen(false);
      setAssignBrand("");
      setAssignCategory("");
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk assign failed");
    } finally {
      setAssigning(false);
    }
  }

  async function handleBulkStatus(next: "ACTIVE" | "ARCHIVED") {
    try {
      const res = await bulkSetProductStatus(Array.from(selected), next);
      toast.success(`${res.updated} product${res.updated === 1 ? "" : "s"} ${next === "ACTIVE" ? "published" : "hidden"}`);
      setSelected(new Set());
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  function onFormSuccess() {
    setDrawerOpen(false);
    list.refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await softDeleteProduct(deleting.id);
      toast.success(`"${deleting.name}" moved to trash`);
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function handleRestore(row: ProductRow) {
    try {
      await restoreProduct(row.id);
      toast.success(`"${row.name}" restored`);
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    }
  }

  async function handleBulkDelete() {
    try {
      await bulkDeleteProducts(Array.from(selected));
      toast.success(`${selected.size} products moved to trash`);
      setSelected(new Set());
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkConfirm(false);
    }
  }

  const columns: Column<ProductRow>[] = [
    {
      key: "select",
      label: "",
      className: "w-10",
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={(e) => {
            const next = new Set(selected);
            if (e.target.checked) next.add(row.id); else next.delete(row.id);
            setSelected(next);
          }}
          className="accent-gold"
        />
      ),
    },
    {
      key: "name",
      label: "Product",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.thumbUrl ? (
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5">
              <Image src={row.thumbUrl} alt="" fill sizes="44px" className="object-cover" />
            </div>
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-lg bg-white/5" />
          )}
          <div>
            <p className="font-medium text-white">{row.name}</p>
            <p className="text-xs text-white/35">{row.collection || `/${row.slug}`}</p>
          </div>
        </div>
      ),
    },
    { key: "category", label: "Category", render: (row) => <span className="text-white/60">{row.category?.name ?? "—"}</span> },
    { key: "brand", label: "Brand", render: (row) => <span className="text-white/60">{row.brand?.name ?? "—"}</span> },
    { key: "tag", label: "Tag", render: (row) => row.tag ? <span className="rounded-full bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold">{row.tag}</span> : <span className="text-white/25">—</span> },
    { key: "featured", label: "Featured", render: (row) => row.featured ? <Star className="h-4 w-4 fill-gold text-gold" /> : <span className="text-white/25">—</span> },
    {
      key: "status",
      label: "Visibility",
      render: (row) => {
        // `status` is a plain string column (see `PUBLIC_PRODUCT_WHERE` in
        // lib/products.ts) — anything other than the two explicit hidden
        // states reads as live, matching the site's own "explicit-only
        // hiding" rule.
        const hidden = row.status === "DRAFT" || row.status === "ARCHIVED";
        const label = row.status === "DRAFT" ? "Draft" : row.status === "ARCHIVED" ? "Hidden" : "Published";
        return (
          <span className={hidden ? "rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/40" : "rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-300"}>
            {label}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <AdminDataTable
        columns={columns}
        rows={list.rows}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={list.setPage}
        search={list.search}
        onSearchChange={list.setSearch}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        loading={list.loading}
        initialLoad={list.initialLoad}
        error={list.error}
        getId={(row) => row.id}
        trash={list.trash}
        onTrashToggle={list.setTrash}
        onEdit={permissions.edit ? (row) => { setEditing(row); setDrawerOpen(true); } : undefined}
        onDelete={permissions.delete ? (row) => setDeleting(row) : undefined}
        onRestore={permissions.edit ? handleRestore : undefined}
        emptyMessage={list.trash ? "Trash is empty." : "No products yet — build the catalogue."}
        searchPlaceholder="Search products, collections…"
        toolbar={
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <select aria-label="Filter by brand" value={brandId} onChange={(e) => { setBrandId(e.target.value); setCategoryId(""); }} className={selectCls}>
              <option value="">All brands</option>
              {opts.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select aria-label="Filter by category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={cn(selectCls, "max-w-[14rem]")}>
              <option value="">All categories</option>
              {opts.categories
                .filter((c) => !brandId || !c.brandId || c.brandId === brandId)
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select aria-label="Filter by visibility" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
              <option value="">Any visibility</option>
              <option value="ACTIVE">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Hidden</option>
            </select>
            <button
              type="button"
              aria-pressed={unassigned}
              onClick={() => setUnassigned((v) => !v)}
              className={cn("h-10 rounded-xl border px-3 text-xs font-medium transition-colors", unassigned ? "border-gold/40 bg-gold/15 text-gold" : "border-white/10 text-white/50 hover:text-white")}
            >
              Needs brand / category
            </button>
            {selected.size > 0 && permissions.edit && !list.trash && (
              <>
                <button onClick={() => setAssignOpen(true)} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/8">
                  <FolderInput className="h-4 w-4" /> Assign {selected.size}
                </button>
                <button onClick={() => handleBulkStatus("ACTIVE")} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-white/8">
                  <Eye className="h-4 w-4" /> Publish
                </button>
                <button onClick={() => handleBulkStatus("ARCHIVED")} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/8">
                  <EyeOff className="h-4 w-4" /> Hide
                </button>
              </>
            )}
            {selected.size > 0 && permissions.delete && (
              <button onClick={() => setBulkConfirm(true)} className="flex items-center gap-2 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
                Delete {selected.size}
              </button>
            )}
            {permissions.create && (
              <button onClick={() => { setEditing(null); setDrawerOpen(true); }} className="flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-ivory transition-colors hover:bg-gold-deep">
                <Plus className="h-4 w-4" />
                New Product
              </button>
            )}
          </div>
        }
      />

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editing ? "Edit Product" : "New Product"} wide>
        <ProductForm product={editing} onSuccess={onFormSuccess} />
      </Drawer>

      <Drawer open={assignOpen} onClose={() => setAssignOpen(false)} title={`Assign ${selected.size} product${selected.size === 1 ? "" : "s"}`} description="Leave a field empty to keep each product's current value.">
        <div className="space-y-5 p-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white/70">Brand</span>
            <select value={assignBrand} onChange={(e) => { setAssignBrand(e.target.value); setAssignCategory(""); }} className={cn(selectCls, "w-full")}>
              <option value="">Keep current</option>
              {opts.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white/70">Category / subcategory</span>
            <select value={assignCategory} onChange={(e) => setAssignCategory(e.target.value)} className={cn(selectCls, "w-full")}>
              <option value="">Keep current</option>
              {opts.categories
                .filter((c) => !assignBrand || !c.brandId || c.brandId === assignBrand)
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-white/30">
              A brand-specific category only accepts that brand&apos;s products. Nothing is changed if any selected product wouldn&apos;t match.
            </span>
          </label>
          <button onClick={handleBulkAssign} disabled={assigning} className="w-full rounded-xl bg-gold py-3 text-sm font-semibold text-ivory transition-colors hover:bg-gold-deep disabled:opacity-60">
            {assigning ? "Updating…" : "Apply to selected"}
          </button>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!deleting}
        title="Move to trash?"
        description={`"${deleting?.name}" will be moved to trash. You can restore it anytime.`}
        confirmLabel="Move to Trash"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={bulkConfirm}
        title={`Move ${selected.size} products to trash?`}
        description="You can restore them individually afterward."
        confirmLabel="Delete Selected"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkConfirm(false)}
      />
    </>
  );
}
