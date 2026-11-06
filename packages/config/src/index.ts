import { z } from "zod";

const developmentPostgresPort = "5433";
const developmentRedisPort = "6380";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    ADMIN_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(60 * 60 * 24 * 14).default(60 * 60 * 12),
    ADMIN_LOGIN_LIMIT: z.coerce.number().int().min(1).max(50).default(8),
    ADMIN_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(60).max(60 * 60).default(900),
    ADMIN_TRUSTED_ORIGINS: z.string().optional(),
    ORDER_TRACKING_SECRET: z.string().min(32).max(256),
    ORDER_STATUS_LIMIT: z.coerce.number().int().min(1).max(120).default(30),
    ORDER_STATUS_WINDOW_SECONDS: z.coerce.number().int().min(30).max(3600).default(60),
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_PUBLIC_BASE_URL: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const databaseUrl = parseUrl(value.DATABASE_URL, "DATABASE_URL", ctx);
    const redisUrl = parseUrl(value.REDIS_URL, "REDIS_URL", ctx);

    if (databaseUrl) {
      if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") {
        addIssue(ctx, "DATABASE_URL", "DATABASE_URL must use the postgresql protocol");
      }
    }

    if (redisUrl) {
      if (redisUrl.protocol !== "redis:" && redisUrl.protocol !== "rediss:") {
        addIssue(ctx, "REDIS_URL", "REDIS_URL must use the redis protocol");
      }
    }

    if (value.NODE_ENV === "production" && value.ORDER_TRACKING_SECRET === "test-only-order-tracking-secret-key") {
      addIssue(ctx, "ORDER_TRACKING_SECRET", "ORDER_TRACKING_SECRET must not use the development test value in production");
    }

    if (value.NODE_ENV === "development" && databaseUrl && redisUrl) {
      if (databaseUrl.port !== developmentPostgresPort) {
        addIssue(ctx, "DATABASE_URL", "In development, PostgreSQL must use port 5433");
      }
      if (redisUrl.port !== developmentRedisPort) {
        addIssue(ctx, "REDIS_URL", "In development, Redis must use port 6380");
      }
    }

    for (const origin of adminTrustedOrigins(value.ADMIN_TRUSTED_ORIGINS)) {
      const parsed = parseUrl(origin, "ADMIN_TRUSTED_ORIGINS", ctx);
      if (parsed && (parsed.protocol !== "http:" && parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password)) {
        addIssue(ctx, "ADMIN_TRUSTED_ORIGINS", "Each trusted origin must be an http(s) origin without credentials or a path");
      }
    }

    const r2Values = [
      value.R2_ACCOUNT_ID,
      value.R2_ACCESS_KEY_ID,
      value.R2_SECRET_ACCESS_KEY,
      value.R2_BUCKET,
      value.R2_PUBLIC_BASE_URL,
    ];
    const present = r2Values.filter((item) => item !== undefined).length;
    if (present !== 0 && present !== r2Values.length) {
      addIssue(ctx, "R2_ACCOUNT_ID", "Set all R2 variables together, or leave them all unset");
    }
    if (value.R2_PUBLIC_BASE_URL) {
      const base = parseUrl(value.R2_PUBLIC_BASE_URL, "R2_PUBLIC_BASE_URL", ctx);
      if (base && (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/")) {
        addIssue(ctx, "R2_PUBLIC_BASE_URL", "R2_PUBLIC_BASE_URL must be an https origin without credentials or a path");
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function adminTrustedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "env";
      return `${path}: ${issue.message}`;
    });
    throw new Error(`Invalid environment configuration:\n${details.join("\n")}`);
  }

  return parsed.data;
}

function parseUrl(value: string, path: string, ctx: z.RefinementCtx): URL | undefined {
  try {
    return new URL(value);
  } catch {
    addIssue(ctx, path, `${path} must be a valid URL`);
    return undefined;
  }
}

function addIssue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({
    code: "custom",
    path: [path],
    message,
  });
}
