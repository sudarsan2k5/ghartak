import {
  adminSessions,
  userRoles,
  users,
  withTransaction,
  type Database,
} from "@ghartak/database";
import type { AdminLoginRequest } from "@ghartak/contracts";
import { and, eq } from "drizzle-orm";
import { HttpError, isUniqueViolation } from "../../../http/errors.js";
import { hashPassword, dummyPasswordCheck, verifyPassword } from "./password.js";
import { createSessionToken, hashSessionToken } from "./session.js";

const invalidLogin = "Email or password is incorrect";

export type CreatedAdmin = {
  id: string;
  name: string;
  email: string;
};

export async function createAdministrator(
  db: Database,
  input: { name: string; email: string; phone: string; password: string },
): Promise<CreatedAdmin> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await withTransaction(db, async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: input.name,
          phone: input.phone,
          email: input.email,
          passwordHash,
          status: "active",
        })
        .returning({ id: users.id, name: users.name, email: users.email });
      if (!user?.email) {
        throw new HttpError(500, "Administrator could not be created");
      }
      await tx.insert(userRoles).values({ userId: user.id, role: "admin" });
      return { id: user.id, name: user.name, email: user.email };
    });
  } catch (error) {
    const unique = isUniqueViolation(error);
    if (unique?.constraint === "users_email_unique") {
      throw new HttpError(409, "An account with that email already exists");
    }
    if (unique?.constraint === "users_phone_unique") {
      throw new HttpError(409, "An account with that phone already exists");
    }
    throw error;
  }
}

export async function loginAdmin(
  db: Database,
  input: AdminLoginRequest,
  ttlSeconds: number,
): Promise<{ token: string; expiresAt: Date; admin: CreatedAdmin }> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
      status: users.status,
      role: userRoles.role,
    })
    .from(users)
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, "admin")))
    .where(eq(users.email, input.email))
    .limit(1);

  const passwordMatches = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : false;
  if (!user?.passwordHash) {
    await dummyPasswordCheck(input.password);
  }

  if (!user || !passwordMatches || user.status !== "active" || user.role !== "admin" || !user.email) {
    throw new HttpError(401, invalidLogin);
  }

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db.insert(adminSessions).values({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return {
    token,
    expiresAt,
    admin: { id: user.id, name: user.name, email: user.email },
  };
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db.update(adminSessions).set({ revokedAt: new Date() }).where(eq(adminSessions.id, sessionId));
}
