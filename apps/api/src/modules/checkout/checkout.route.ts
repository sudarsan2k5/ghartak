import { guestCheckoutRequestSchema, guestCheckoutResponseSchema } from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { parseRequest } from "../../http/validation.js";
import { consumeCheckoutAttempt } from "./checkout-limit.js";
import { createCheckoutService } from "./checkout.service.js";

export type CheckoutRouteOptions = {
  db: Database;
  redis: Redis;
  trackingTokenSecret: string;
  checkoutLimit: number;
  checkoutWindowSeconds: number;
  checkoutRatePrefix: string;
};

export function registerCheckoutRoutes(app: FastifyInstance, options: CheckoutRouteOptions): void {
  const checkout = createCheckoutService(options.db, { trackingTokenSecret: options.trackingTokenSecret });

  app.post(
    "/checkout/guest",
    { bodyLimit: 32_768 },
    async (request) => {
      await consumeCheckoutAttempt(options.redis, {
        prefix: options.checkoutRatePrefix,
        ip: request.ip,
        limit: options.checkoutLimit,
        windowSeconds: options.checkoutWindowSeconds,
      });
      const body = parseRequest(() => guestCheckoutRequestSchema.parse(request.body));
      const order = guestCheckoutResponseSchema.parse(await checkout.createGuestOrder(body));
      request.log.info({ orderNumber: order.orderNumber, itemCount: order.items.length }, "guest order placed");
      return order;
    },
  );
}
