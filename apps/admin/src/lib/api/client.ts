import { errorResponseSchema } from "@ghartak/contracts";
import type { ZodType } from "zod";

export type ApiFailureKind =
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "invalid"
  | "network"
  | "unexpected";

export type ApiFailure = {
  ok: false;
  status: number | null;
  kind: ApiFailureKind;
  message: string;
};

export type ApiSuccess<T> = {
  ok: true;
  status: number;
  data: T;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type ApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    get<T>(path: string, schema: ZodType<T>): Promise<ApiResult<T>> {
      return request(fetchImpl, baseUrl, "GET", path, schema);
    },
    post<T>(path: string, schema: ZodType<T> | null, body?: unknown): Promise<ApiResult<T>> {
      return request(fetchImpl, baseUrl, "POST", path, schema, body);
    },
    postForm<T>(path: string, schema: ZodType<T>, body: FormData, headers?: Record<string, string>): Promise<ApiResult<T>> {
      return request(fetchImpl, baseUrl, "POST", path, schema, body, headers);
    },
    patch<T>(path: string, schema: ZodType<T>, body: unknown): Promise<ApiResult<T>> {
      return request(fetchImpl, baseUrl, "PATCH", path, schema, body);
    },
    put<T>(path: string, schema: ZodType<T>, body: unknown): Promise<ApiResult<T>> {
      return request(fetchImpl, baseUrl, "PUT", path, schema, body);
    },
    delete<T>(path: string, schema: ZodType<T> | null): Promise<ApiResult<T>> {
      return request(fetchImpl, baseUrl, "DELETE", path, schema);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function request<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  schema: ZodType<T> | null,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body === undefined || isForm ? {} : { "content-type": "application/json" }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      status: null,
      kind: "network",
      message: "The admin service could not be reached.",
    };
  }

  if (response.status === 204 || schema === null) {
    if (response.ok) {
      return { ok: true, status: response.status, data: undefined as T };
    }
  }

  const payload = await readJson(response);
  if (!response.ok) {
    return failureFromResponse(response.status, payload);
  }

  if (!schema) {
    return { ok: true, status: response.status, data: undefined as T };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: response.status,
      kind: "unexpected",
      message: "The admin service returned an unexpected response.",
    };
  }
  return { ok: true, status: response.status, data: parsed.data };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function failureFromResponse(status: number, payload: unknown): ApiFailure {
  const parsed = errorResponseSchema.safeParse(payload);
  const serverMessage = parsed.success ? safeServerMessage(status, parsed.data.error.message) : null;
  if (status === 401) {
    return { ok: false, status, kind: "unauthorized", message: serverMessage ?? "Authentication required" };
  }
  if (status === 403) {
    return { ok: false, status, kind: "forbidden", message: serverMessage ?? "You do not have access to this resource" };
  }
  if (status === 409) {
    return { ok: false, status, kind: "conflict", message: serverMessage ?? "That value is already in use" };
  }
  if (status === 422) {
    return { ok: false, status, kind: "invalid", message: serverMessage ?? "The request could not be completed." };
  }
  if (status === 429) {
    return {
      ok: false,
      status,
      kind: "rate_limited",
      message: serverMessage ?? "Too many sign-in attempts. Try again later.",
    };
  }
  if (status === 503) {
    return {
      ok: false,
      status,
      kind: "unavailable",
      message: "The admin service is temporarily unavailable.",
    };
  }
  if (status >= 400 && status < 500) {
    return { ok: false, status, kind: "invalid", message: serverMessage ?? "The request could not be completed." };
  }
  return { ok: false, status, kind: "unexpected", message: "The admin service could not complete that request." };
}

function safeServerMessage(status: number, message: string): string | null {
  if (status >= 500 || message.includes("\n") || message.length > 200) {
    return null;
  }
  return message;
}
