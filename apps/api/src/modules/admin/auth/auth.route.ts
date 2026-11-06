import {
  adminLoginRequestSchema,
  adminSessionResponseSchema,
  errorResponseSchema,
} from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { parseRequest } from "../../../http/validation.js";
import { loginAdmin, revokeSession } from "./accounts.js";
import { requireAdmin } from "./guard.js";
import { consumeLoginAttempt } from "./login-limit.js";
import { clearSessionCookie, sessionCookie } from "./session.js";

export type AuthRouteOptions = {
  db: Database;
  redis: Redis;
  sessionTtlSeconds: number;
  secureCookies: boolean;
  loginLimit: number;
  loginWindowSeconds: number;
  rateLimitPrefix: string;
  trustedOrigins: readonly string[];
};

export function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  app.post("/admin/session", async (request, reply) => {
    const body = parseRequest(() => adminLoginRequestSchema.parse(request.body));
    await consumeLoginAttempt(options.redis, {
      prefix: options.rateLimitPrefix,
      ip: request.ip,
      email: body.email,
      limit: options.loginLimit,
      windowSeconds: options.loginWindowSeconds,
    });
    const session = await loginAdmin(options.db, body, options.sessionTtlSeconds);
    request.log.info({ actorUserId: session.admin.id }, "admin signed in");
    reply.header("set-cookie", sessionCookie(session.token, options.sessionTtlSeconds, options.secureCookies));
    return adminSessionResponseSchema.parse({
      expiresAt: session.expiresAt.toISOString(),
      admin: session.admin,
    });
  });

  app.post("/admin/logout", { preHandler: requireAdmin(options.db) }, async (request, reply) => {
    const actor = request.admin;
    if (!actor) {
      return reply.status(401).send(
        errorResponseSchema.parse({ error: { code: "request_error", message: "Authentication required" } }),
      );
    }
    await revokeSession(options.db, actor.sessionId);
    request.log.info({ actorUserId: actor.userId }, "admin signed out");
    reply.header("set-cookie", clearSessionCookie(options.secureCookies));
    return reply.status(204).send();
  });
}
