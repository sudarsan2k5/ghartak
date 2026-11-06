import type { GuestCheckoutRequest } from "@ghartak/contracts";

import { getApiBaseUrl } from "@/api/client";
import { postGuestCheckout, type CheckoutRequestResult } from "@/api/checkout-request";

export type { CheckoutRequestFailure, CheckoutRequestResult } from "@/api/checkout-request";

export async function placeGuestOrder(
  request: GuestCheckoutRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutRequestResult> {
  return postGuestCheckout(request, { baseUrl: getApiBaseUrl(), fetchImpl });
}
