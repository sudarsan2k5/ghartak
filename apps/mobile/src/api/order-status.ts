import {
  customerOrderStatusResponseSchema,
  errorResponseSchema,
  type CustomerOrderStatusResponse,
} from "@ghartak/contracts";

const statusTimeoutMs = 10_000;

export type OrderStatusFailure = {
  ok: false;
  kind: "timeout" | "network" | "unauthorized" | "unavailable" | "rate_limited" | "server" | "invalid";
  status: number | null;
};

export type OrderStatusResult = { ok: true; order: CustomerOrderStatusResponse } | OrderStatusFailure;

export async function getCustomerOrderStatus(
  token: string,
  deps: { baseUrl: string; fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal },
): Promise<OrderStatusResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, deps.timeoutMs ?? statusTimeoutMs);
  const onAbort = () => {
    controller.abort(deps.signal?.reason);
  };
  deps.signal?.addEventListener("abort", onAbort, { once: true });
  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(`${deps.baseUrl}/api/v1/orders/status`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    let parsedBody: unknown = null;
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = null;
    }
    if (!response.ok) {
      errorResponseSchema.safeParse(parsedBody);
      if (response.status === 401) {
        return { ok: false, kind: "unauthorized", status: 401 };
      }
      if (response.status === 404) {
        return { ok: false, kind: "unavailable", status: 404 };
      }
      if (response.status === 429) {
        return { ok: false, kind: "rate_limited", status: 429 };
      }
      if (response.status >= 500) {
        return { ok: false, kind: "server", status: response.status };
      }
      return { ok: false, kind: "server", status: response.status };
    }
    const parsed = customerOrderStatusResponseSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return { ok: false, kind: "invalid", status: response.status };
    }
    return { ok: true, order: parsed.data };
  } catch (error) {
    if (deps.signal?.aborted) {
      throw error;
    }
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { ok: false, kind: "timeout", status: null };
    }
    return { ok: false, kind: "network", status: null };
  } finally {
    clearTimeout(timeout);
    deps.signal?.removeEventListener("abort", onAbort);
  }
}
