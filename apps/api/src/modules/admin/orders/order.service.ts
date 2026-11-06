import {
  normalizeIndianMobile,
  type AdminOrderCancel,
  type AdminOrderListQuery,
  type AdminOrderStatusUpdate,
  type AdminOrderSummaryQuery,
} from "@ghartak/contracts";
import {
  canTransitionOrderStatus,
  inventoryMovements,
  orderAddresses,
  orderItems,
  orders,
  orderStatusEvents,
  payments,
  storeProducts,
  users,
  withTransaction,
  type Database,
  type DatabaseTransaction,
} from "@ghartak/database";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { HttpError } from "../../../http/errors.js";
import { nextAvailability } from "../inventory/inventory.service.js";

export type OrderCancelOptions = {
  afterStockRestore?: () => Promise<void>;
};

export function createAdminOrderService(db: Database) {
  return {
    async list(query: AdminOrderListQuery) {
      const where = orderWhere(query);
      const [counted] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(orders)
        .leftJoin(orderAddresses, eq(orderAddresses.orderId, orders.id))
        .where(where);
      const total = Number(counted?.total ?? 0);
      const rows = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          userId: orders.userId,
          customerName: orderAddresses.recipientName,
          customerPhone: orderAddresses.phone,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          itemCount: sql<number>`(select cast(count(*) as int) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
          subtotalPaise: orders.subtotalPaise,
          deliveryFeePaise: orders.deliveryFeePaise,
          totalPaise: orders.totalPaise,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(orderAddresses, eq(orderAddresses.orderId, orders.id))
        .where(where)
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);

      return {
        orders: rows.map((row) => ({
          id: row.id,
          orderNumber: row.orderNumber,
          customerName: row.customerName ?? "",
          customerPhone: row.customerPhone ?? "",
          customerType: customerType(row.userId),
          status: row.status,
          paymentMethod: row.paymentMethod,
          paymentStatus: row.paymentStatus,
          itemCount: Number(row.itemCount ?? 0),
          subtotalPaise: row.subtotalPaise,
          deliveryFeePaise: row.deliveryFeePaise,
          totalPaise: row.totalPaise,
          createdAt: row.createdAt.toISOString(),
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pageCount: total === 0 ? 0 : Math.ceil(total / query.limit),
        },
      };
    },

    async summary(query: AdminOrderSummaryQuery) {
      const where = dateWhere(query.createdFrom, query.createdTo);
      const [row] = await db
        .select({
          totalOrders: sql<number>`cast(count(*) as int)`,
          placed: sql<number>`cast(count(*) filter (where ${orders.status} = 'placed') as int)`,
          confirmed: sql<number>`cast(count(*) filter (where ${orders.status} = 'confirmed') as int)`,
          packed: sql<number>`cast(count(*) filter (where ${orders.status} = 'packed') as int)`,
          outForDelivery: sql<number>`cast(count(*) filter (where ${orders.status} = 'out_for_delivery') as int)`,
          delivered: sql<number>`cast(count(*) filter (where ${orders.status} = 'delivered') as int)`,
          cancelled: sql<number>`cast(count(*) filter (where ${orders.status} = 'cancelled') as int)`,
          guestOrders: sql<number>`cast(count(*) filter (where ${orders.userId} is null) as int)`,
          registeredOrders: sql<number>`cast(count(*) filter (where ${orders.userId} is not null) as int)`,
          codAwaitingPaymentCount: sql<number>`cast(count(*) filter (where ${orders.paymentMethod} = 'cash_on_delivery' and ${orders.paymentStatus} = 'pending' and ${orders.status} <> 'cancelled') as int)`,
          codAwaitingCollectionPaise: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${orders.paymentMethod} = 'cash_on_delivery' and ${orders.paymentStatus} = 'pending' and ${orders.status} <> 'cancelled'), 0)`,
        })
        .from(orders)
        .where(where);
      if (!row) {
        throw new HttpError(500, "Order summary could not be loaded");
      }
      return {
        totalOrders: Number(row.totalOrders),
        placed: Number(row.placed),
        confirmed: Number(row.confirmed),
        packed: Number(row.packed),
        outForDelivery: Number(row.outForDelivery),
        delivered: Number(row.delivered),
        cancelled: Number(row.cancelled),
        guestOrders: Number(row.guestOrders),
        registeredOrders: Number(row.registeredOrders),
        codAwaitingPaymentCount: Number(row.codAwaitingPaymentCount),
        codAwaitingCollectionPaise: Number(row.codAwaitingCollectionPaise),
      };
    },

    async get(orderId: string) {
      const [order] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          userId: orders.userId,
          status: orders.status,
          subtotalPaise: orders.subtotalPaise,
          deliveryFeePaise: orders.deliveryFeePaise,
          discountPaise: orders.discountPaise,
          taxPaise: orders.taxPaise,
          totalPaise: orders.totalPaise,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!order) {
        throw new HttpError(404, "Order not found");
      }

      const [address] = await db.select().from(orderAddresses).where(eq(orderAddresses.orderId, orderId)).limit(1);
      if (!address) {
        throw new HttpError(404, "Order not found");
      }

      const [items, paymentRows, events] = await Promise.all([
        db
          .select({
            productId: orderItems.productId,
            productName: orderItems.productName,
            quantity: orderItems.quantity,
            unitPricePaise: orderItems.unitPricePaise,
            lineTotalPaise: orderItems.lineTotalPaise,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId))
          .orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
        db
          .select({
            provider: payments.provider,
            amountPaise: payments.amountPaise,
            status: payments.status,
          })
          .from(payments)
          .where(eq(payments.orderId, orderId))
          .orderBy(asc(payments.createdAt))
          .limit(1),
        db
          .select({
            fromStatus: orderStatusEvents.fromStatus,
            toStatus: orderStatusEvents.toStatus,
            note: orderStatusEvents.note,
            createdAt: orderStatusEvents.createdAt,
            actorId: users.id,
            actorName: users.name,
          })
          .from(orderStatusEvents)
          .leftJoin(users, eq(users.id, orderStatusEvents.actorUserId))
          .where(eq(orderStatusEvents.orderId, orderId))
          .orderBy(asc(orderStatusEvents.createdAt), asc(orderStatusEvents.id)),
      ]);

      if (items.length === 0) {
        throw new HttpError(404, "Order not found");
      }

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerType: customerType(order.userId),
        customerName: address.recipientName,
        customerPhone: address.phone,
        userId: order.userId,
        address: {
          recipientName: address.recipientName,
          phone: address.phone,
          addressType: address.addressType,
          line1: address.line1,
          line2: address.line2,
          landmark: address.landmark,
          locality: address.locality,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          latitude: address.latitude,
          longitude: address.longitude,
        },
        items,
        subtotalPaise: order.subtotalPaise,
        deliveryFeePaise: order.deliveryFeePaise,
        discountPaise: order.discountPaise,
        taxPaise: order.taxPaise,
        totalPaise: order.totalPaise,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        payment: paymentRows[0] ?? null,
        statusHistory: events.map((event) => ({
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          note: event.note,
          actor: event.actorId && event.actorName ? { id: event.actorId, name: event.actorName } : null,
          createdAt: event.createdAt.toISOString(),
        })),
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };
    },

    async updateStatus(orderId: string, input: AdminOrderStatusUpdate, actorUserId: string) {
      await withTransaction(db, async (tx) => {
        const order = await lockOrder(tx, orderId);
        if (!canTransitionOrderStatus(order.status, input.status)) {
          throw new HttpError(409, `Order status cannot move from ${order.status} to ${input.status}`, {
            code: "invalid_status_transition",
          });
        }
        await tx.update(orders).set({ status: input.status }).where(eq(orders.id, orderId));
        await tx.insert(orderStatusEvents).values({
          orderId,
          fromStatus: order.status,
          toStatus: input.status,
          actorUserId,
        });
      });
      return this.get(orderId);
    },

    async cancel(orderId: string, input: AdminOrderCancel, actorUserId: string, options?: OrderCancelOptions) {
      await withTransaction(db, async (tx) => {
        const order = await lockOrder(tx, orderId);
        if (order.status === "cancelled") {
          throw new HttpError(409, "This order is already cancelled", { code: "already_cancelled" });
        }
        if (order.status === "delivered") {
          throw new HttpError(409, "A delivered order cannot be cancelled", { code: "cannot_cancel_delivered" });
        }
        if (!canTransitionOrderStatus(order.status, "cancelled")) {
          throw new HttpError(409, `Order status cannot move from ${order.status} to cancelled`, {
            code: "invalid_status_transition",
          });
        }

        const items = await tx
          .select({
            productId: orderItems.productId,
            quantity: orderItems.quantity,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId))
          .orderBy(asc(orderItems.productId));
        if (items.length === 0) {
          throw new HttpError(409, "This order has no items to restore");
        }

        const quantities = new Map<string, number>();
        for (const item of items) {
          quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
        }
        const productIds = [...quantities.keys()].sort((left, right) => left.localeCompare(right));
        const listings = await tx
          .select({
            id: storeProducts.id,
            productId: storeProducts.productId,
            stockQuantity: storeProducts.stockQuantity,
            availability: storeProducts.availability,
          })
          .from(storeProducts)
          .where(inArray(storeProducts.productId, productIds))
          .orderBy(asc(storeProducts.productId))
          .for("update");
        if (listings.length !== productIds.length) {
          throw new HttpError(409, "Stock cannot be restored because a listing is missing");
        }

        for (const listing of listings) {
          const quantity = quantities.get(listing.productId) ?? 0;
          const stockAfter = listing.stockQuantity + quantity;
          const availability = nextAvailability(listing.availability, stockAfter);
          await tx
            .update(storeProducts)
            .set({ stockQuantity: stockAfter, availability })
            .where(eq(storeProducts.id, listing.id));
          await tx.insert(inventoryMovements).values({
            storeProductId: listing.id,
            movementType: "addition",
            quantityDelta: quantity,
            stockAfter,
            reason: `order_cancel:${order.orderNumber}`,
            actorUserId,
          });
        }

        if (options?.afterStockRestore) {
          await options.afterStockRestore();
        }

        await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, orderId));
        await tx.insert(orderStatusEvents).values({
          orderId,
          fromStatus: order.status,
          toStatus: "cancelled",
          note: input.reason,
          actorUserId,
        });
      });
      return this.get(orderId);
    },
  };
}

function customerType(userId: string | null): "guest" | "registered" {
  return userId ? "registered" : "guest";
}

function dateWhere(createdFrom: string | undefined, createdTo: string | undefined): SQL | undefined {
  const filters: SQL[] = [];
  if (createdFrom) {
    filters.push(gte(orders.createdAt, new Date(createdFrom)));
  }
  if (createdTo) {
    filters.push(lte(orders.createdAt, new Date(createdTo)));
  }
  if (filters.length === 0) {
    return undefined;
  }
  return and(...filters);
}

function orderWhere(query: AdminOrderListQuery): SQL | undefined {
  const filters: SQL[] = [];
  if (query.status) {
    filters.push(eq(orders.status, query.status));
  }
  if (query.paymentStatus) {
    filters.push(eq(orders.paymentStatus, query.paymentStatus));
  }
  if (query.paymentMethod) {
    filters.push(eq(orders.paymentMethod, query.paymentMethod));
  }
  if (query.customerType === "guest") {
    filters.push(isNull(orders.userId));
  }
  if (query.customerType === "registered") {
    filters.push(isNotNull(orders.userId));
  }
  if (query.orderNumber) {
    filters.push(ilike(orders.orderNumber, sanitizeLike(query.orderNumber)));
  }
  if (query.customerName) {
    filters.push(ilike(orderAddresses.recipientName, `%${sanitizeLike(query.customerName)}%`));
  }
  if (query.customerPhone) {
    const normalized = normalizeIndianMobile(query.customerPhone);
    filters.push(eq(orderAddresses.phone, normalized ?? query.customerPhone.trim()));
  }
  const dates = dateWhere(query.createdFrom, query.createdTo);
  if (dates) {
    filters.push(dates);
  }
  if (filters.length === 0) {
    return undefined;
  }
  return and(...filters);
}

function sanitizeLike(value: string): string {
  return value.replaceAll("\\", "").replaceAll("%", "").replaceAll("_", "");
}

async function lockOrder(tx: DatabaseTransaction, orderId: string) {
  const [order] = await tx
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  if (!order) {
    throw new HttpError(404, "Order not found");
  }
  return order;
}
