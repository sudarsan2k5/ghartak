import { customerOrderStatusResponseSchema } from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { HttpError } from "../../http/errors.js";
import { consumeOrderStatusAttempt } from "./order-status-limit.js";
import { createOrderStatusService } from "./order-status.service.js";
import { readTrackingBearer } from "./tracking-token.js";

export type OrderStatusRouteOptions = {
  db: Database;
  redis: Redis;
  statusLimit: number;
  statusWindowSeconds: number;
  statusRatePrefix: string;
};

export function registerOrderStatusRoutes(app: FastifyInstance, options: OrderStatusRouteOptions): void {
  const orders = createOrderStatusService(options.db);

  app.get("/orders/status", async (request) => {
    await consumeOrderStatusAttempt(options.redis, {
      prefix: options.statusRatePrefix,
      ip: request.ip,
      limit: options.statusLimit,
      windowSeconds: options.statusWindowSeconds,
    });
    const token = readTrackingBearer(request.headers.authorization);
    if (!token) {
      throw new HttpError(401, "Authentication required", { code: "unauthorized" });
    }
    return customerOrderStatusResponseSchema.parse(await orders.getByTrackingToken(token));
  });
}
