import { customerOrderStatusResponseSchema, type CustomerOrderStatusResponse } from "@ghartak/contracts";
import { orderStatusEvents, orders, type Database } from "@ghartak/database";
import { asc, eq } from "drizzle-orm";
import { HttpError } from "../../http/errors.js";
import { hashTrackingToken } from "./tracking-token.js";

export function createOrderStatusService(db: Database) {
  return {
    async getByTrackingToken(token: string): Promise<CustomerOrderStatusResponse> {
      const tokenHash = hashTrackingToken(token);
      const [order] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          updatedAt: orders.updatedAt,
          expiresAt: orders.trackingTokenExpiresAt,
          revokedAt: orders.trackingTokenRevokedAt,
        })
        .from(orders)
        .where(eq(orders.trackingTokenHash, tokenHash))
        .limit(1);

      if (!order || order.revokedAt || !order.expiresAt || order.expiresAt.getTime() <= Date.now()) {
        throw new HttpError(404, "Order not found", { code: "not_found" });
      }

      const events = await db
        .select({
          status: orderStatusEvents.toStatus,
          createdAt: orderStatusEvents.createdAt,
        })
        .from(orderStatusEvents)
        .where(eq(orderStatusEvents.orderId, order.id))
        .orderBy(asc(orderStatusEvents.createdAt), asc(orderStatusEvents.id));

      return customerOrderStatusResponseSchema.parse({
        orderNumber: order.orderNumber,
        status: order.status,
        updatedAt: order.updatedAt.toISOString(),
        events: events.map((event) => ({
          status: event.status,
          createdAt: event.createdAt.toISOString(),
        })),
      });
    },
  };
}
