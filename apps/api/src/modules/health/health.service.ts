import type { DependencyStatus, ReadinessResponse } from "@ghartak/contracts";
import { pingDatabase, type Database } from "@ghartak/database";
import type { Redis } from "ioredis";
import { pingRedis } from "../../infrastructure/redis.js";

type ReadinessDependencies = {
  db: Database;
  redis: Redis;
};

type CheckErrorHandler = (dependency: "postgres" | "redis", error: unknown) => void;

export async function checkReadiness(
  dependencies: ReadinessDependencies,
  onError?: CheckErrorHandler,
): Promise<ReadinessResponse> {
  const [postgres, redis] = await Promise.all([
    checkDependency("postgres", () => pingDatabase(dependencies.db), onError),
    checkDependency("redis", () => pingRedis(dependencies.redis), onError),
  ]);

  return {
    status: postgres === "up" && redis === "up" ? "ok" : "unavailable",
    checks: {
      postgres,
      redis,
    },
  };
}

async function checkDependency(
  dependency: "postgres" | "redis",
  check: () => Promise<void>,
  onError?: CheckErrorHandler,
): Promise<DependencyStatus> {
  try {
    await check();
    return "up";
  } catch (error) {
    onError?.(dependency, error);
    return "down";
  }
}
