import type { Redis } from "ioredis";
import { createHash } from "node:crypto";
import { HttpError } from "../../../http/errors.js";
import { incrementWindow } from "../../../http/rate-limit.js";

export async function consumeLoginAttempt(
  redis: Redis,
  input: { prefix: string; ip: string; email: string; limit: number; windowSeconds: number },
): Promise<void> {
  const emailKey = `${input.prefix}:email:${createHash("sha256").update(input.email).digest("hex")}`;
  const ipKey = `${input.prefix}:ip:${input.ip}`;
  try {
    const [emailCount, ipCount] = await Promise.all([
      incrementWindow(redis, emailKey, input.windowSeconds),
      incrementWindow(redis, ipKey, input.windowSeconds),
    ]);
    if (emailCount > input.limit || ipCount > input.limit) {
      throw new HttpError(429, "Too many sign-in attempts. Try again later.");
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(503, "Sign-in is temporarily unavailable");
  }
}

