import { adminProductListResponseSchema } from "@ghartak/contracts";
import type { ApiClient, ApiFailure, ApiResult } from "../api/client";

export type SessionStatus = "loading" | "authenticated" | "anonymous" | "forbidden" | "unavailable";

export function dashboardRedirect(status: SessionStatus): "/login" | null {
  if (status === "anonymous" || status === "forbidden") {
    return "/login";
  }
  return null;
}

export function redirectForFailure(failure: ApiFailure): "/login" | null {
  if (failure.kind === "unauthorized" || failure.kind === "forbidden") {
    return "/login";
  }
  return null;
}

export function loginRedirect(status: SessionStatus): "/overview" | null {
  if (status === "authenticated") {
    return "/overview";
  }
  return null;
}

export async function restoreSession(client: ApiClient): Promise<Exclude<SessionStatus, "loading">> {
  const result = await client.get("/api/v1/admin/products?limit=1", adminProductListResponseSchema);
  return statusFromResult(result);
}

export async function endSession(client: ApiClient) {
  return client.post("/api/v1/admin/logout", null);
}

export function statusFromResult(result: ApiResult<unknown>): Exclude<SessionStatus, "loading"> {
  if (result.ok) {
    return "authenticated";
  }
  if (result.kind === "unauthorized") {
    return "anonymous";
  }
  if (result.kind === "forbidden") {
    return "forbidden";
  }
  return "unavailable";
}
