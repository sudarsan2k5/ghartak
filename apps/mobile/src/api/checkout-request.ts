import {
  errorResponseSchema,
  guestCheckoutRequestSchema,
  guestCheckoutResponseSchema,
  type ErrorResponse,
  type GuestCheckoutRequest,
  type GuestCheckoutResponse,
} from "@ghartak/contracts";

const checkoutTimeoutMs = 15_000;

export type CheckoutRequestFailure = {
  ok: false;
  kind: "timeout" | "network" | "http" | "invalid";
  status: number | null;
  error: ErrorResponse["error"] | null;
};

export type CheckoutRequestResult = { ok: true; order: GuestCheckoutResponse } | CheckoutRequestFailure;

export async function postGuestCheckout(
  request: GuestCheckoutRequest,
  deps: { baseUrl: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<CheckoutRequestResult> {
  const payload = guestCheckoutRequestSchema.parse(request);
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, deps.timeoutMs ?? checkoutTimeoutMs);
  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(`${deps.baseUrl}/api/v1/checkout/guest`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
    let parsedBody: unknown = null;
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = null;
    }
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(parsedBody);
      return {
        ok: false,
        kind: "http",
        status: response.status,
        error: parsed.success ? parsed.data.error : null,
      };
    }
    const parsed = guestCheckoutResponseSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return { ok: false, kind: "invalid", status: response.status, error: null };
    }
    return { ok: true, order: parsed.data };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { ok: false, kind: "timeout", status: null, error: null };
    }
    return { ok: false, kind: "network", status: null, error: null };
  } finally {
    clearTimeout(timeout);
  }
}
