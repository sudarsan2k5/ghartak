import type { Redis } from "ioredis";
import { HttpError } from "../../http/errors.js";
import { incrementWindow } from "../../http/rate-limit.js";

export async function consumeCheckoutAttempt(
  redis: Redis,
  input: { prefix: string; ip: string; limit: number; windowSeconds: number },
): Promise<void> {
  const ipKey = `${input.prefix}:ip:${input.ip}`;
  try {
    const count = await incrementWindow(redis, ipKey, input.windowSeconds);
    if (count > input.limit) {
      throw new HttpError(429, "Too many checkout attempts. Try again later.", {
        code: "rate_limited",
      });
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(503, "Checkout is temporarily unavailable");
  }
}
