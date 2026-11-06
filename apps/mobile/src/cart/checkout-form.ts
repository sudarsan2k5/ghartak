import {
  guestCheckoutRequestSchema,
  type ErrorResponse,
  type GuestCheckoutRequest,
  type GuestCheckoutResponse,
} from "@ghartak/contracts";

export type CheckoutFormFields = {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
};

export type CheckoutFieldErrors = {
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
};

export type CheckoutItems = GuestCheckoutRequest["items"];

export function checkoutFingerprint(request: Omit<GuestCheckoutRequest, "idempotencyKey">): string {
  return JSON.stringify({
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    deliveryAddress: request.deliveryAddress,
    items: [...request.items]
      .map((item) => ({ productId: item.productId, quantity: item.quantity }))
      .sort((left, right) => left.productId.localeCompare(right.productId)),
  });
}

export function nextCheckoutAttempt(
  previous: { fingerprint: string; key: string } | null,
  fingerprint: string,
  generateKey: () => string,
): { fingerprint: string; key: string } {
  if (previous && previous.fingerprint === fingerprint) {
    return previous;
  }
  return { fingerprint, key: generateKey() };
}

export function validateGuestCheckout(input: {
  form: CheckoutFormFields;
  items: CheckoutItems;
  idempotencyKey: string;
}):
  | { ok: true; request: GuestCheckoutRequest }
  | { ok: false; kind: "validation"; fields: CheckoutFieldErrors; message: string } {
  const parsed = guestCheckoutRequestSchema.safeParse({
    customerName: input.form.customerName,
    customerPhone: input.form.customerPhone,
    deliveryAddress: input.form.deliveryAddress,
    items: input.items,
    idempotencyKey: input.idempotencyKey,
  });
  if (parsed.success) {
    return { ok: true, request: parsed.data };
  }

  const fields: CheckoutFieldErrors = {};
  let itemMessage: string | null = null;
  for (const issue of parsed.error.issues) {
    const path = issue.path[0];
    if (path === "customerName" && !fields.customerName) {
      fields.customerName = nameError(input.form.customerName, issue.message);
    } else if (path === "customerPhone" && !fields.customerPhone) {
      fields.customerPhone = "Enter a valid 10-digit Indian mobile number";
    } else if (path === "deliveryAddress" && !fields.deliveryAddress) {
      fields.deliveryAddress = addressError(input.form.deliveryAddress, issue.message);
    } else if (path === "items" && !itemMessage) {
      itemMessage = itemsError(input.items, issue.message);
    }
  }

  return {
    ok: false,
    kind: "validation",
    fields,
    message: itemMessage ?? "Check the highlighted details and try again.",
  };
}

function nameError(value: string, fallback: string): string {
  if (value.trim().length === 0) {
    return "Enter your name";
  }
  if (value.trim().length > 120) {
    return "Name must be 120 characters or fewer";
  }
  return fallback;
}

function addressError(value: string, fallback: string): string {
  if (value.trim().length === 0) {
    return "Enter a delivery address";
  }
  if (value.trim().length > 500) {
    return "Address must be 500 characters or fewer";
  }
  return fallback;
}

function itemsError(items: CheckoutItems, fallback: string): string {
  if (items.length === 0) {
    return "Your cart is empty.";
  }
  return fallback;
}

export type CheckoutPlaceResult =
  | { ok: true; order: GuestCheckoutResponse }
  | {
      ok: false;
      kind: "timeout" | "network" | "http" | "invalid";
      status: number | null;
      error: ErrorResponse["error"] | null;
    };

export type CheckoutSubmitSuccess = { ok: true; order: GuestCheckoutResponse; request: GuestCheckoutRequest };

export type CheckoutSubmitFailure =
  | { ok: false; kind: "busy"; message: string }
  | { ok: false; kind: "validation"; fields: CheckoutFieldErrors; message: string }
  | {
      ok: false;
      kind:
        | "timeout"
        | "network"
        | "unavailable_product"
        | "insufficient_stock"
        | "idempotency_conflict"
        | "rate_limited"
        | "invalid_request"
        | "server"
        | "unavailable"
        | "invalid_response";
      message: string;
      productId?: string;
      keepIdempotencyKey: boolean;
    };

export type CheckoutSubmitResult = CheckoutSubmitSuccess | CheckoutSubmitFailure;

export function createCheckoutSubmitter(options: {
  client: { place: (request: GuestCheckoutRequest) => Promise<CheckoutPlaceResult> };
  generateKey: () => string;
  productName?: (productId: string) => string | null;
}) {
  let attempt: { fingerprint: string; key: string } | null = null;
  let busy = false;

  return {
    getAttempt() {
      return attempt;
    },
    isBusy() {
      return busy;
    },
    async submit(input: { form: CheckoutFormFields; items: CheckoutItems }): Promise<CheckoutSubmitResult> {
      if (busy) {
        return { ok: false, kind: "busy", message: "Your order is already being placed." };
      }

      const prepared = validateGuestCheckout({
        form: input.form,
        items: input.items,
        idempotencyKey: attempt?.key ?? "checkout-key",
      });
      if (!prepared.ok) {
        return prepared;
      }

      const fingerprint = checkoutFingerprint({
        customerName: prepared.request.customerName,
        customerPhone: prepared.request.customerPhone,
        deliveryAddress: prepared.request.deliveryAddress,
        items: prepared.request.items,
      });
      attempt = nextCheckoutAttempt(attempt, fingerprint, options.generateKey);
      const request: GuestCheckoutRequest = {
        ...prepared.request,
        idempotencyKey: attempt.key,
      };

      busy = true;
      try {
        const result = await options.client.place(request);
        if (result.ok) {
          attempt = null;
          return { ok: true, order: result.order, request };
        }
        const failure = mapRequestFailure(result, options.productName);
        if (!failure.keepIdempotencyKey) {
          attempt = null;
        }
        return failure;
      } finally {
        busy = false;
      }
    },
  };
}

function mapRequestFailure(
  result: Exclude<CheckoutPlaceResult, { ok: true }>,
  productName?: (productId: string) => string | null,
): Extract<CheckoutSubmitFailure, { keepIdempotencyKey: boolean }> {
  if (result.kind === "timeout") {
    return {
      ok: false,
      kind: "timeout",
      message: "The request timed out. Your cart is saved. Try again without changing the order.",
      keepIdempotencyKey: true,
    };
  }
  if (result.kind === "network") {
    return {
      ok: false,
      kind: "network",
      message: "Ghartak is unreachable right now. Your cart is saved. You can try again.",
      keepIdempotencyKey: true,
    };
  }
  if (result.kind === "invalid") {
    return {
      ok: false,
      kind: "invalid_response",
      message: "The order could not be confirmed. Your cart is saved. Try again.",
      keepIdempotencyKey: true,
    };
  }

  const code = result.error?.code;
  const productId = result.error?.productId;
  const named = productId ? productName?.(productId) : null;

  if (result.status === 429 || code === "rate_limited") {
    return {
      ok: false,
      kind: "rate_limited",
      message: "Too many checkout attempts. Wait a moment, then try again.",
      keepIdempotencyKey: true,
    };
  }
  if (code === "idempotency_conflict") {
    return {
      ok: false,
      kind: "idempotency_conflict",
      message: "This checkout attempt does not match the previous one. Review the order and place it again.",
      keepIdempotencyKey: false,
    };
  }
  if (code === "insufficient_stock") {
    return {
      ok: false,
      kind: "insufficient_stock",
      message: named
        ? `There is not enough stock for ${named}. Review your cart and try again.`
        : "There is not enough stock for a product in your cart. Review your cart and try again.",
      productId,
      keepIdempotencyKey: true,
    };
  }
  if (code === "product_unavailable") {
    return {
      ok: false,
      kind: "unavailable_product",
      message: named
        ? `${named} is no longer available. Review your cart before placing the order.`
        : "A product in your cart is no longer available. Review your cart before placing the order.",
      productId,
      keepIdempotencyKey: true,
    };
  }
  if (result.status === 400) {
    return {
      ok: false,
      kind: "invalid_request",
      message: fieldMessage(result.error?.message) ?? "Check your name, phone number, and address.",
      keepIdempotencyKey: true,
    };
  }
  if (result.status === 503) {
    return {
      ok: false,
      kind: "unavailable",
      message: "Checkout is temporarily unavailable. Your cart is saved. Try again shortly.",
      keepIdempotencyKey: true,
    };
  }
  if (result.status !== null && result.status >= 500) {
    return {
      ok: false,
      kind: "server",
      message: "The order could not be placed. Your cart is saved. Try again.",
      keepIdempotencyKey: true,
    };
  }
  return {
    ok: false,
    kind: "server",
    message: "The order could not be placed. Your cart is saved. Try again.",
    keepIdempotencyKey: true,
  };
}

function fieldMessage(message: string | undefined): string | null {
  if (!message) {
    return null;
  }
  if (message.startsWith("customerName:")) {
    return "Enter your name";
  }
  if (message.startsWith("customerPhone:")) {
    return "Enter a valid 10-digit Indian mobile number";
  }
  if (message.startsWith("deliveryAddress:")) {
    return "Enter a delivery address";
  }
  if (message.startsWith("items:")) {
    return "Review the products in your cart.";
  }
  return null;
}
