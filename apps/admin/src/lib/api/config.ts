const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function resolveApiBaseUrl(value: string | undefined, nodeEnv: string): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    if (nodeEnv === "production") {
      throw new Error("NEXT_PUBLIC_API_BASE_URL is required in production");
    }
    return "http://localhost:3000";
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an http(s) origin");
  }

  const hasPath = parsed.pathname !== "/" && parsed.pathname !== "";
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    hasPath ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an http(s) origin without credentials or a path");
  }

  if (nodeEnv === "production" && loopbackHosts.has(parsed.hostname)) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must not use a loopback address in production");
  }

  return parsed.origin;
}

export function readApiBaseUrl(): string {
  return resolveApiBaseUrl(process.env["NEXT_PUBLIC_API_BASE_URL"], process.env.NODE_ENV ?? "development");
}
