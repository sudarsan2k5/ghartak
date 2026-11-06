import { createHash, createHmac } from "node:crypto";

const tokenVersion = "ghartak.order-tracking.v1";

export const trackingTokenTtlMs = 30 * 24 * 60 * 60 * 1000;

export function issueTrackingToken(secret: string, orderId: string): string {
  return createHmac("sha256", secret).update(tokenVersion).update("\0").update(orderId).digest("base64url");
}

export function hashTrackingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function trackingTokenExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + trackingTokenTtlMs);
}

export function readTrackingBearer(authorization: string | undefined): string | null {
  const match = authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{43})$/);
  return match?.[1] ?? null;
}
