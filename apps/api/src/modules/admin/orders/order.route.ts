import {
  adminOrderCancelSchema,
  adminOrderDetailSchema,
  adminOrderListQuerySchema,
  adminOrderListResponseSchema,
  adminOrderStatusUpdateSchema,
  adminOrderSummaryQuerySchema,
  adminOrderSummarySchema,
} from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../../../http/errors.js";
import { routeParam, routeUuidSchema } from "../../../http/params.js";
import { parseRequest } from "../../../http/validation.js";
import { requireAdmin } from "../auth/guard.js";
import { createAdminOrderService } from "./order.service.js";

export function registerAdminOrderRoutes(app: FastifyInstance, db: Database): void {
  const orders = createAdminOrderService(db);
  const guard = { preHandler: requireAdmin(db) };

  app.get("/admin/orders/summary", guard, async (request) => {
    const query = parseRequest(() => adminOrderSummaryQuerySchema.parse(request.query));
    return adminOrderSummarySchema.parse(await orders.summary(query));
  });

  app.get("/admin/orders", guard, async (request) => {
    const query = parseRequest(() => adminOrderListQuerySchema.parse(request.query));
    return adminOrderListResponseSchema.parse(await orders.list(query));
  });

  app.get("/admin/orders/:orderId", guard, async (request) => {
    const orderId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "orderId")));
    return adminOrderDetailSchema.parse(await orders.get(orderId));
  });

  app.patch("/admin/orders/:orderId/status", guard, async (request) => {
    const orderId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "orderId")));
    const body = parseRequest(() => adminOrderStatusUpdateSchema.parse(request.body));
    const actor = request.admin;
    if (!actor) {
      throw new HttpError(401, "Authentication required");
    }
    const order = adminOrderDetailSchema.parse(await orders.updateStatus(orderId, body, actor.userId));
    request.log.info(
      { actorUserId: actor.userId, orderId, orderNumber: order.orderNumber, status: order.status },
      "admin updated order status",
    );
    return order;
  });

  app.post("/admin/orders/:orderId/cancel", guard, async (request) => {
    const orderId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "orderId")));
    const body = parseRequest(() => adminOrderCancelSchema.parse(request.body));
    const actor = request.admin;
    if (!actor) {
      throw new HttpError(401, "Authentication required");
    }
    const order = adminOrderDetailSchema.parse(await orders.cancel(orderId, body, actor.userId));
    request.log.info(
      { actorUserId: actor.userId, orderId, orderNumber: order.orderNumber },
      "admin cancelled order",
    );
    return order;
  });
}
