export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly productId?: string;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; productId?: string },
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options?.code ?? (statusCode >= 500 ? "internal_error" : "request_error");
    if (options?.productId) {
      this.productId = options.productId;
    }
  }
}

export function isUniqueViolation(error: unknown): { constraint: string | null } | null {
  const record = causeOf(error);
  if (!record || record.code !== "23505") {
    return null;
  }
  return { constraint: typeof record.constraint_name === "string" ? record.constraint_name : null };
}

function causeOf(error: unknown): { code?: unknown; constraint_name?: unknown } | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  if ("code" in error) {
    return error;
  }
  if ("cause" in error) {
    return causeOf(error.cause);
  }
  return null;
}
