import { errorResponseSchema } from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import Fastify from "fastify";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { registerCatalogueRoutes } from "./modules/catalogue/catalogue.route.js";
import { registerCheckoutRoutes } from "./modules/checkout/checkout.route.js";
import { registerOrderStatusRoutes } from "./modules/orders/order-status.route.js";
import { registerAuthRoutes, type AuthRouteOptions } from "./modules/admin/auth/auth.route.js";
import { registerAdminOrderRoutes } from "./modules/admin/orders/order.route.js";
import { registerAdminSettingsRoutes } from "./modules/admin/settings/settings.route.js";
import { assertAdminRequestOrigin } from "./modules/admin/auth/origin.js";
import { registerAdminCategoryRoutes } from "./modules/admin/categories/category.route.js";
import { registerAdminImageRoutes } from "./modules/admin/images/image.route.js";
import { maxImageBytes } from "./modules/admin/images/image-policy.js";
import { createImageStorage, type ImageStorage, type ImageStorageConfig } from "./modules/admin/images/image-storage.js";
import multipart from "@fastify/multipart";
import { registerAdminInventoryRoutes } from "./modules/admin/inventory/inventory.route.js";
import { registerAdminProductRoutes } from "./modules/admin/products/product.route.js";
import { registerHealthRoutes } from "./modules/health/health.route.js";
import { adminCorsDecision, applyAdminCorsHeaders } from "./http/cors.js";
import { HttpError } from "./http/errors.js";

export type AppDependencies = {
  logger: Logger;
  db: Database;
  redis: Redis;
  auth?: Omit<AuthRouteOptions, "db" | "redis">;
  checkout?: {
    checkoutLimit: number;
    checkoutWindowSeconds: number;
    checkoutRatePrefix: string;
  };
  tracking?: {
    secret: string;
    statusLimit: number;
    statusWindowSeconds: number;
    statusRatePrefix: string;
  };
  imageStorage?: ImageStorageConfig | null;
  imageStorageClient?: ImageStorage | null;
};

export async function buildApp(dependencies: AppDependencies) {
  const auth = dependencies.auth ?? {
    sessionTtlSeconds: 60 * 60 * 12,
    secureCookies: false,
    loginLimit: 8,
    loginWindowSeconds: 900,
    rateLimitPrefix: "admin:login",
    trustedOrigins: [],
  };
  const checkout = dependencies.checkout ?? {
    checkoutLimit: 20,
    checkoutWindowSeconds: 600,
    checkoutRatePrefix: "checkout:guest",
  };
  const tracking = dependencies.tracking ?? {
    secret: fallbackTrackingSecret(),
    statusLimit: 30,
    statusWindowSeconds: 60,
    statusRatePrefix: "orders:status",
  };
  const app = Fastify({
    loggerInstance: dependencies.logger,
    bodyLimit: maxImageBytes + 64 * 1024,
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
    const decision = adminCorsDecision({
      method: request.method,
      path: request.url,
      origin,
      trustedOrigins: auth.trustedOrigins,
    });
    if (!decision.preflight && !decision.allowOrigin) {
      return;
    }
    applyAdminCorsHeaders((name, value) => reply.header(name, value), decision, origin !== undefined);
    if (decision.preflight) {
      return reply.status(204).send();
    }
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(
      errorResponseSchema.parse({
        error: {
          code: "not_found",
          message: "Route not found",
        },
      }),
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error);
    request.log.error({ name: normalized.name, message: normalized.message }, "request failed");

    const code =
      normalized.statusCode >= 500 && !normalized.trusted
        ? "internal_error"
        : normalized.code ?? "request_error";
    return reply.status(normalized.statusCode).send(
      errorResponseSchema.parse({
        error: {
          code,
          message:
            normalized.statusCode >= 500 && !normalized.trusted
              ? "Internal server error"
              : normalized.message,
          ...(normalized.productId ? { productId: normalized.productId } : {}),
        },
      }),
    );
  });

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: maxImageBytes,
      fields: 16,
      fieldSize: 1024,
    },
  });

  await app.register(
    (instance) => {
      registerHealthRoutes(instance, {
        db: dependencies.db,
        redis: dependencies.redis,
      });
      registerCatalogueRoutes(instance, { db: dependencies.db });
      registerCheckoutRoutes(instance, {
        db: dependencies.db,
        redis: dependencies.redis,
        trackingTokenSecret: tracking.secret,
        ...checkout,
      });
      registerOrderStatusRoutes(instance, {
        db: dependencies.db,
        redis: dependencies.redis,
        statusLimit: tracking.statusLimit,
        statusWindowSeconds: tracking.statusWindowSeconds,
        statusRatePrefix: tracking.statusRatePrefix,
      });
      instance.addHook("preHandler", async (request) => {
        const path = request.url.split("?")[0] ?? "";
        if (!path.startsWith("/api/v1/admin")) {
          return;
        }
        assertAdminRequestOrigin({
          method: request.method,
          cookieHeader: request.headers.cookie,
          originHeader: request.headers.origin,
          refererHeader: request.headers.referer,
          hostHeader: request.headers.host,
          protocol: request.protocol,
          trustedOrigins: auth.trustedOrigins,
        });
      });
      registerAuthRoutes(instance, { ...auth, db: dependencies.db, redis: dependencies.redis });
      registerAdminProductRoutes(instance, dependencies.db);
      registerAdminCategoryRoutes(instance, dependencies.db);
      registerAdminInventoryRoutes(instance, dependencies.db);
      registerAdminImageRoutes(
        instance,
        dependencies.db,
        dependencies.imageStorageClient === undefined
          ? createImageStorage(dependencies.imageStorage ?? null)
          : dependencies.imageStorageClient,
      );
      registerAdminSettingsRoutes(instance, dependencies.db);
      registerAdminOrderRoutes(instance, dependencies.db);
    },
    { prefix: "/api/v1" },
  );

  return app;
}

const developmentTrackingSecret = "test-only-order-tracking-secret-key";

function fallbackTrackingSecret(): string {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("ORDER_TRACKING_SECRET is required");
  }
  const secret = process.env["ORDER_TRACKING_SECRET"];
  if (secret && secret.length >= 32) {
    return secret;
  }
  return developmentTrackingSecret;
}

function normalizeError(error: unknown): {
  name: string;
  message: string;
  statusCode: number;
  trusted: boolean;
  code?: string;
  productId?: string;
} {
  const trusted = error instanceof HttpError;
  const message = error instanceof Error ? error.message : "Internal server error";
  const name = error instanceof Error ? error.name : "Error";
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 500;

  return {
    name,
    message,
    statusCode,
    trusted,
    ...(error instanceof HttpError ? { code: error.code } : {}),
    ...(error instanceof HttpError && error.productId ? { productId: error.productId } : {}),
  };
}
