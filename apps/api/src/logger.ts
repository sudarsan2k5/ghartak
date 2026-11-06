import { type Logger, pino } from "pino";
import type { Env } from "@ghartak/config";

export const logRedactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.idempotency-key",
  "req.body.password",
  "req.body.customerPhone",
  "req.body.deliveryAddress",
  "req.body.idempotencyKey",
  "res.headers.set-cookie",
  "DATABASE_URL",
  "REDIS_URL",
  "R2_SECRET_ACCESS_KEY",
  "password",
  "*.password",
  "*.passwordHash",
  "*.customerPhone",
  "*.deliveryAddress",
  "*.idempotencyKey",
  "*.phone",
  "ORDER_TRACKING_SECRET",
  "*.ORDER_TRACKING_SECRET",
  "token",
  "*.token",
  "*.trackingToken",
  "*.secretAccessKey",
  "*.DATABASE_URL",
  "*.REDIS_URL",
  "*.R2_SECRET_ACCESS_KEY",
] as const;

export function createLogger(level: Env["LOG_LEVEL"]): Logger {
  return pino({
    level,
    redact: {
      paths: [...logRedactPaths],
      censor: "[redacted]",
    },
  });
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted-url]");
}
