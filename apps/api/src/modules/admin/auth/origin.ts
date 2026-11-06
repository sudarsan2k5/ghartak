import { HttpError } from "../../../http/errors.js";
import { hasSessionCookie } from "./session.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function assertAdminRequestOrigin(input: {
  method: string;
  cookieHeader: string | undefined;
  originHeader: string | undefined;
  refererHeader: string | undefined;
  hostHeader: string | undefined;
  protocol: string;
  trustedOrigins: readonly string[];
}): void {
  if (!unsafeMethods.has(input.method.toUpperCase())) {
    return;
  }

  const source = sourceOrigin(input.originHeader, input.refererHeader);
  const allowed = new Set(input.trustedOrigins);
  if (input.hostHeader && (input.protocol === "http" || input.protocol === "https")) {
    allowed.add(`${input.protocol}://${input.hostHeader}`);
  }

  const cookieAuthenticated = hasSessionCookie(input.cookieHeader);
  if (!cookieAuthenticated) {
    if (source && !allowed.has(source)) {
      throw new HttpError(403, "This origin is not allowed");
    }
    return;
  }

  if (!source || !allowed.has(source)) {
    throw new HttpError(403, "This origin is not allowed");
  }
}

function sourceOrigin(originHeader: string | undefined, refererHeader: string | undefined): string | null {
  if (originHeader && originHeader !== "null") {
    return parseOrigin(originHeader);
  }
  if (!refererHeader) {
    return null;
  }
  return parseOrigin(refererHeader);
}

function parseOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
