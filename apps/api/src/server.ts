import { adminTrustedOrigins, loadEnv, type Env } from "@ghartak/config";
import { closeDatabase, openDatabase, pingDatabase } from "@ghartak/database";
import { buildApp } from "./app.js";
import { connectRedis, createRedisConnection } from "./infrastructure/redis.js";
import { createLogger, safeErrorMessage } from "./logger.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const db = openDatabase(env.DATABASE_URL);
const redis = createRedisConnection(env.REDIS_URL, (error) => {
  logger.error({ message: safeErrorMessage(error) }, "redis connection error");
});

let shutdownTask: Promise<void> | undefined;

async function start(): Promise<void> {
  const app = await buildApp({
    logger,
    db,
    redis: redis.client,
    auth: {
      sessionTtlSeconds: env.ADMIN_SESSION_TTL_SECONDS,
      secureCookies: env.NODE_ENV === "production",
      loginLimit: env.ADMIN_LOGIN_LIMIT,
      loginWindowSeconds: env.ADMIN_LOGIN_WINDOW_SECONDS,
      rateLimitPrefix: "admin:login",
      trustedOrigins: adminTrustedOrigins(env.ADMIN_TRUSTED_ORIGINS),
    },
    imageStorage: imageStorageConfig(env),
    tracking: {
      secret: env.ORDER_TRACKING_SECRET,
      statusLimit: env.ORDER_STATUS_LIMIT,
      statusWindowSeconds: env.ORDER_STATUS_WINDOW_SECONDS,
      statusRatePrefix: "orders:status",
    },
  });

  const shutdown = (signal: string, exitCode: number): Promise<void> => {
    shutdownTask ??= close(signal, exitCode);
    return shutdownTask;

    async function close(currentSignal: string, currentExitCode: number): Promise<void> {
      logger.info({ signal: currentSignal }, "shutting down");

      try {
        await app.close();
        await redis.close();
        await closeDatabase();
        logger.info("shutdown complete");
        process.exit(currentExitCode);
      } catch (error) {
        logger.error({ message: safeErrorMessage(error) }, "shutdown failed");
        process.exit(1);
      }
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });

  try {
    await connectRedis(redis.client);
    logger.info(connectionTarget(env.REDIS_URL), "redis connected");
  } catch (error) {
    logger.error({ message: safeErrorMessage(error) }, "redis unavailable at startup");
  }

  try {
    await pingDatabase(db);
    logger.info(connectionTarget(env.DATABASE_URL), "postgres connected");
  } catch (error) {
    logger.error({ message: safeErrorMessage(error) }, "postgres unavailable at startup");
  }

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    logger.error({ message: safeErrorMessage(error) }, "api failed to start");
    await shutdown("startup", 1);
  }
}

function imageStorageConfig(env: Env) {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET ||
    !env.R2_PUBLIC_BASE_URL
  ) {
    return null;
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  };
}

function connectionTarget(connectionString: string): { host: string; port: string } {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: url.port,
  };
}

void start();
