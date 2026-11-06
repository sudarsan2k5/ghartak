import { createHash, randomBytes } from "node:crypto";

const sessionCookieName = "ghartak_admin_session";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readSessionToken(authorization: string | undefined, cookieHeader: string | undefined): string | null {
  const bearer = authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/);
  if (bearer?.[1]) {
    return bearer[1];
  }
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === sessionCookieName && rest.length > 0) {
      return rest.join("=");
    }
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${sessionCookieName}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/v1/admin",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie("", 0, secure);
}

export function hasSessionCookie(cookieHeader: string | undefined): boolean {
  return readSessionToken(undefined, cookieHeader) !== null;
}
