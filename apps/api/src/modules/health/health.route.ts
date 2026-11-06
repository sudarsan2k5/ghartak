import { healthResponseSchema, readinessResponseSchema } from "@ghartak/contracts";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Database } from "@ghartak/database";
import { safeErrorMessage } from "../../logger.js";
import { checkReadiness } from "./health.service.js";

type HealthRouteDependencies = {
  db: Database;
  redis: Redis;
};

export function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: HealthRouteDependencies,
): void {
  app.get("/health", () => {
    return healthResponseSchema.parse({
      status: "ok",
      service: "api",
    });
  });

  app.get("/health/ready", async (request, reply) => {
    const result = await checkReadiness(dependencies, (dependency, error) => {
      request.log.warn(
        { dependency, message: safeErrorMessage(error) },
        "readiness dependency check failed",
      );
    });
    const body = readinessResponseSchema.parse(result);
    const statusCode = body.status === "ok" ? 200 : 503;

    return reply.status(statusCode).send(body);
  });
}
