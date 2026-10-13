"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, ArrowUp, ArrowDown } from "lucide-react";
import { useAdminList } from "@/hooks/useAdminList";
import { AdminDataTable, type Column } from "@/components/admin/AdminDataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Drawer } from "@/components/admin/Drawer";
import { CategoryForm } from "./CategoryForm";
import { listCategories, softDeleteCategory, restoreCategory, reorderCategory, type CategoryRow } from "./actions";

interface CategoriesManagerProps {
  permissions: { create: boolean; edit: boolean; delete: boolean };
}

export function CategoriesManager({ permissions }: CategoriesManagerProps) {
  const list = useAdminList<CategoryRow>(listCategories, { initialSortBy: "sortOrder", initialSortDir: "asc" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }
  function openEdit(row: CategoryRow) {
    setEditing(row);
    setDrawerOpen(true);
  }
  function onFormSuccess() {
    setDrawerOpen(false);
    list.refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await softDeleteCategory(deleting.id);
      toast.success(`"${deleting.name}" moved to trash`);
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function handleRestore(row: CategoryRow) {
    try {
      await restoreCategory(row.id);
      toast.success(`"${row.name}" restored`);
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    }
  }

  async function handleReorder(row: CategoryRow, direction: "up" | "down") {
    try {
      await reorderCategory(row.id, direction);
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  const columns: Column<CategoryRow>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-white">{row.name}</p>
          <p className="text-xs text-white/35">
            /{row.slug}
            {row.parent && <span> · under {row.parent.name}</span>}
            {row.brand && <span> · {row.brand.name} only</span>}
          </p>
        </div>
      ),
    },
    {
      key: "products",
      label: "Products",
      render: (row) => <span className="text-white/60">{row._count.products}</span>,
    },
    {
      key: "children",
      label: "Subcategories",
      render: (row) => <span className="text-white/60">{row._count.children}</span>,
    },
    {
      key: "sortOrder",
      label: "Order",
      sortable: true,
      render: (row) =>
        list.trash ? (
          <span className="text-white/60">{row.sortOrder}</span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleReorder(row, "up")}
              aria-label={`Move ${row.name} up`}
              className="grid h-7 w-7 place-items-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleReorder(row, "down")}
              aria-label={`Move ${row.name} down`}
              className="grid h-7 w-7 place-items-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
    },
    {
      key: "published",
      label: "Status",
      render: (row) => (
        <span
          className={
            row.published
              ? "rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-300"
              : "rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/40"
          }
        >
          {row.published ? "Published" : "Draft"}
        </span>
      ),
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
        onEdit={permissions.edit ? openEdit : undefined}
        onDelete={permissions.delete ? (row) => setDeleting(row) : undefined}
        onRestore={permissions.edit ? handleRestore : undefined}
        emptyMessage={list.trash ? "Trash is empty." : "No categories yet — create your first one."}
        searchPlaceholder="Search categories…"
        toolbar={
          permissions.create && (
            <button
              onClick={openCreate}
              className="ml-auto flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-ivory transition-colors hover:bg-gold-deep"
            >
              <Plus className="h-4 w-4" />
              New Category
            </button>
          )
        }
      />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Category" : "New Category"}
        description={editing ? `Editing "${editing.name}"` : "Add a new catalogue category"}
      >
        <CategoryForm category={editing} onSuccess={onFormSuccess} />
      </Drawer>

      <ConfirmDialog
        open={!!deleting}
        title="Move to trash?"
        description={`"${deleting?.name}" will be moved to trash. You can restore it anytime.`}
        confirmLabel="Move to Trash"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
