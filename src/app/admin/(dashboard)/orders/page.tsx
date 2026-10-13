import { auth } from "@/lib/auth";
import { can, requirePermission } from "@/lib/rbac";
import { OrdersManager } from "./OrdersManager";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  await requirePermission("orders", "view");

  const session = await auth();
  const role = session!.user.role;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-white/40">
          Orders customers started on the website and finished on WhatsApp. Match the reference in the chat to the
          order here, then move it through confirmed, processing and completed.
        </p>
      </div>
      <OrdersManager
        permissions={{
          edit: can(role, "orders", "edit"),
          delete: can(role, "orders", "delete"),
        }}
      />
    </div>
  );
}
