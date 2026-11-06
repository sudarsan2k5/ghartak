import type { Redis } from "ioredis";

export async function incrementWindow(redis: Redis, key: string, windowSeconds: number): Promise<number> {
  const count = await redis.eval(
    `local current = redis.call("INCR", KEYS[1])
if redis.call("TTL", KEYS[1]) < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current`,
    1,
    key,
    String(windowSeconds),
  );
  const value = typeof count === "number" ? count : Number(count);
  if (!Number.isInteger(value)) {
    throw new Error("rate limit counter was not numeric");
  }
  return value;
}
