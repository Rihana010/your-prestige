"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import type { ListParams, ListResult } from "@/hooks/useAdminList";
import { safeOrderBy, safePaging } from "@/lib/list-params";
import { ORDER_STATUSES } from "@/lib/order-constants";

export type OrderRow = Prisma.CustomerOrderGetPayload<{ include: { items: true } }>;

export interface OrderListParams extends ListParams {
  status?: string;
}

export async function listOrders(params: OrderListParams): Promise<ListResult<OrderRow>> {
  await requirePermission("orders", "view");

  const search = params.search?.trim();
  const status = ORDER_STATUSES.find((s) => s === params.status);

  const where: Prisma.CustomerOrderWhereInput = {
    deletedAt: params.trash ? { not: null } : null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
            { customerPhone: { contains: search, mode: "insensitive" } },
            { items: { some: { productName: { contains: search, mode: "insensitive" } } } },
            { items: { some: { sku: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customerOrder.findMany({
      where,
      include: { items: true },
      orderBy: safeOrderBy("CustomerOrder", params.sortBy, params.sortDir, "createdAt"),
      ...safePaging(params.page, params.pageSize),
    }),
    prisma.customerOrder.count({ where }),
  ]);

  return { rows, total };
}

const statusSchema = z.enum(ORDER_STATUSES);

export async function updateOrderStatus(id: string, status: string) {
  await requirePermission("orders", "edit");
  const next = statusSchema.parse(status);

  const before = await prisma.customerOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
  const order = await prisma.customerOrder.update({ where: { id }, data: { status: next } });

  await logAudit({
    action: "order.status",
    entity: "CustomerOrder",
    entityId: id,
    oldValue: { status: before.status },
    newValue: { status: next },
  });
  return order;
}

export async function updateOrderAdminNotes(id: string, adminNotes: string) {
  await requirePermission("orders", "edit");
  const notes = z.string().max(2000).parse(adminNotes).trim();

  const order = await prisma.customerOrder.update({
    where: { id },
    data: { adminNotes: notes || null },
  });
  await logAudit({ action: "order.notes", entity: "CustomerOrder", entityId: id });
  return order;
}

export async function softDeleteOrder(id: string) {
  await requirePermission("orders", "delete");
  const order = await prisma.customerOrder.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit({ action: "order.delete", entity: "CustomerOrder", entityId: id });
  return order;
}

export async function restoreOrder(id: string) {
  await requirePermission("orders", "delete");
  const order = await prisma.customerOrder.update({ where: { id }, data: { deletedAt: null } });
  await logAudit({ action: "order.restore", entity: "CustomerOrder", entityId: id });
  return order;
}
