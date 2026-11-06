import { adminSessions, userRoles, users, type Database } from "@ghartak/database";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "../../../http/errors.js";
import { hashSessionToken, readSessionToken } from "./session.js";

export type AdminActor = {
  userId: string;
  sessionId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminActor;
  }
}

export function requireAdmin(db: Database) {
  return async function guard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = readSessionToken(request.headers.authorization, request.headers.cookie);
    if (!token) {
      throw new HttpError(401, "Authentication required");
    }
    const tokenHash = hashSessionToken(token);
    const [session] = await db
      .select({
        sessionId: adminSessions.id,
        userId: adminSessions.userId,
        role: userRoles.role,
        status: users.status,
      })
      .from(adminSessions)
      .innerJoin(users, eq(users.id, adminSessions.userId))
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, "admin")))
      .where(
        and(
          eq(adminSessions.tokenHash, tokenHash),
          isNull(adminSessions.revokedAt),
          gt(adminSessions.expiresAt, new Date()),
          eq(users.status, "active"),
        ),
      )
      .limit(1);

    if (!session) {
      const [known] = await db
        .select({ userId: adminSessions.userId })
        .from(adminSessions)
        .where(eq(adminSessions.tokenHash, tokenHash))
        .limit(1);
      if (known) {
        const [role] = await db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(and(eq(userRoles.userId, known.userId), eq(userRoles.role, "admin")))
          .limit(1);
        if (!role) {
          throw new HttpError(403, "You do not have access to this resource");
        }
      }
      throw new HttpError(401, "Authentication required");
    }

    request.admin = { userId: session.userId, sessionId: session.sessionId };
  };
}
