const allowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const allowedHeaders = "Content-Type, Idempotency-Key";

export type AdminCorsDecision = {
  allowOrigin: string | null;
  preflight: boolean;
};

export function adminCorsDecision(input: {
  method: string;
  path: string;
  origin: string | undefined;
  trustedOrigins: readonly string[];
}): AdminCorsDecision {
  const path = input.path.split("?")[0] ?? "";
  if (!path.startsWith("/api/v1/admin")) {
    return { allowOrigin: null, preflight: false };
  }
  const origin = input.origin;
  const allowed =
    origin !== undefined && origin !== "null" && input.trustedOrigins.includes(origin) ? origin : null;
  return {
    allowOrigin: allowed,
    preflight: input.method.toUpperCase() === "OPTIONS",
  };
}

export function applyAdminCorsHeaders(
  setHeader: (name: string, value: string) => void,
  decision: AdminCorsDecision,
  originPresent: boolean,
): void {
  if (!originPresent) {
    return;
  }
  setHeader("Vary", "Origin");
  if (!decision.allowOrigin) {
    return;
  }
  setHeader("Access-Control-Allow-Origin", decision.allowOrigin);
  setHeader("Access-Control-Allow-Credentials", "true");
  if (decision.preflight) {
    setHeader("Access-Control-Allow-Methods", allowedMethods);
    setHeader("Access-Control-Allow-Headers", allowedHeaders);
    setHeader("Access-Control-Max-Age", "600");
  }
}
