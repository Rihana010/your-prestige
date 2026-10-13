"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAdminList } from "@/hooks/useAdminList";
import { AdminDataTable, type Column } from "@/components/admin/AdminDataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Drawer } from "@/components/admin/Drawer";
import { ORDER_STATUSES } from "@/lib/order-constants";
import { cn } from "@/lib/utils";
import {
  listOrders,
  updateOrderStatus,
  updateOrderAdminNotes,
  softDeleteOrder,
  restoreOrder,
  type OrderRow,
} from "./actions";

const statusStyles: Record<string, string> = {
  NEW: "bg-gold/15 text-gold",
  CONFIRMED: "bg-sky-400/15 text-sky-300",
  PROCESSING: "bg-amber-400/15 text-amber-300",
  COMPLETED: "bg-emerald-400/15 text-emerald-300",
  CANCELLED: "bg-white/8 text-white/40",
};

const fmt = (d: Date | string) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function OrdersManager({ permissions }: { permissions: { edit: boolean; delete: boolean } }) {
  const [status, setStatus] = useState("");
  const list = useAdminList<OrderRow>((p) => listOrders({ ...p, status }), {
    initialSortBy: "createdAt",
    initialSortDir: "desc",
    deps: [status],
  });
  const [open, setOpen] = useState<OrderRow | null>(null);
  const [notes, setNotes] = useState("");
  const [deleting, setDeleting] = useState<OrderRow | null>(null);

  function openOrder(row: OrderRow) {
    setOpen(row);
    setNotes(row.adminNotes ?? "");
  }

  async function changeStatus(row: OrderRow, next: string) {
    try {
      await updateOrderStatus(row.id, next);
      toast.success(`${row.orderNumber} marked ${next.toLowerCase()}`);
      setOpen((o) => (o && o.id === row.id ? { ...o, status: next } : o));
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function saveNotes() {
    if (!open) return;
    try {
      await updateOrderAdminNotes(open.id, notes);
      toast.success("Notes saved");
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save notes");
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await softDeleteOrder(deleting.id);
      toast.success(`${deleting.orderNumber} moved to trash`);
      if (open?.id === deleting.id) setOpen(null);
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function handleRestore(row: OrderRow) {
    try {
      await restoreOrder(row.id);
      toast.success("Order restored");
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    }
  }

  const columns: Column<OrderRow>[] = [
    {
      key: "orderNumber",
      label: "Order",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-mono text-sm font-medium text-white">{row.orderNumber}</p>
          <p className="text-xs text-white/35">{fmt(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "customerName",
      label: "Customer",
      render: (row) =>
        row.customerName || row.customerPhone ? (
          <div>
            <p className="text-white/80">{row.customerName ?? "—"}</p>
            <p className="text-xs text-white/35">{row.customerPhone ?? ""}</p>
          </div>
        ) : (
          <span className="text-xs text-white/30">Via WhatsApp chat</span>
        ),
    },
    {
      key: "items",
      label: "Items",
      render: (row) => (
        <div>
          <p className="text-white/80">{row.items[0]?.productName ?? "—"}</p>
          {row.items.length > 1 && <p className="text-xs text-white/35">+{row.items.length - 1} more</p>}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => (
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusStyles[row.status])}>
          {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {["", ...ORDER_STATUSES].map((s) => (
          <button
            key={s || "all"}
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              status === s
                ? "border-gold/40 bg-gold/15 text-gold"
                : "border-white/10 text-white/50 hover:text-white"
            )}
          >
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>

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
        onEdit={openOrder}
        onDelete={permissions.delete ? (row) => setDeleting(row) : undefined}
        onRestore={permissions.delete ? handleRestore : undefined}
        emptyMessage={
          list.trash
            ? "Trash is empty."
            : status
              ? `No ${status.toLowerCase()} orders.`
              : "No orders yet. They appear here when a customer taps “Order on WhatsApp”."
        }
        searchPlaceholder="Search by reference, product, code or customer…"
      />

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.orderNumber ?? "Order"} description={open ? fmt(open.createdAt) : undefined} wide>
        {open && (
          <div className="space-y-6 p-6 text-sm">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Status</h3>
              <div className="flex flex-wrap gap-2">
                {ORDER_STATUSES.map((s) => (
                  <button
                    key={s}
                    disabled={!permissions.edit || open.status === s}
                    onClick={() => changeStatus(open, s)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-default",
                      open.status === s ? statusStyles[s] : "border border-white/10 text-white/50 hover:text-white disabled:opacity-40"
                    )}
                  >
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Customer</h3>
              {open.customerName || open.customerPhone ? (
                <p className="text-white/80">
                  {open.customerName ?? "—"} {open.customerPhone ? `· ${open.customerPhone}` : ""}
                </p>
              ) : (
                <p className="text-white/40">No details entered on the website — the customer is in your WhatsApp chat.</p>
              )}
              {open.notes && <p className="mt-2 rounded-lg bg-white/5 p-3 text-white/70">“{open.notes}”</p>}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
                Ordered products ({open.items.length})
              </h3>
              <ul className="divide-y divide-white/8 rounded-xl border border-white/10">
                {open.items.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-4 p-3.5">
                    <div className="min-w-0">
                      <p className="font-medium text-white">{it.productName}</p>
                      <p className="text-xs text-white/40">
                        {[it.brandName, it.variantLabel || it.size, it.sku && `Code ${it.sku}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm text-gold">
                      {it.quantity} {it.unit}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Internal notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!permissions.edit}
                rows={3}
                maxLength={2000}
                placeholder="Delivery date, quoted price, who is handling it…"
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white placeholder:text-white/25 focus:border-gold focus:outline-none"
              />
              {permissions.edit && (
                <button
                  onClick={saveNotes}
                  className="mt-2 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-ivory transition-colors hover:bg-gold-deep"
                >
                  Save notes
                </button>
              )}
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!deleting}
        title="Move to trash?"
        description={`Order ${deleting?.orderNumber} will be moved to trash. You can restore it from there.`}
        confirmLabel="Move to Trash"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
