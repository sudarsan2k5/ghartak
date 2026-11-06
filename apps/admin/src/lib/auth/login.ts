import { adminLoginRequestSchema, adminSessionResponseSchema, type AdminSessionResponse } from "@ghartak/contracts";
import type { ApiClient, ApiFailure } from "../api/client";

export type LoginFields = {
  email: string;
  password: string;
};

export type LoginFieldErrors = {
  email?: string;
  password?: string;
};

export function loginFieldErrors(input: LoginFields): LoginFieldErrors {
  const parsed = adminLoginRequestSchema.safeParse(input);
  if (parsed.success) {
    return {};
  }
  const errors: LoginFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "email" && errors.email === undefined) {
      errors.email = "Enter a valid email address.";
    }
    if (field === "password" && errors.password === undefined) {
      errors.password = "Use 12 to 128 characters.";
    }
  }
  return errors;
}

export function loginErrorMessage(failure: ApiFailure): string {
  if (failure.kind === "unauthorized") {
    return "Email or password is incorrect";
  }
  if (failure.kind === "rate_limited") {
    return "Too many sign-in attempts. Try again later.";
  }
  if (failure.kind === "unavailable" || failure.kind === "network") {
    return "The admin service is temporarily unavailable.";
  }
  if (failure.kind === "forbidden") {
    return "This dashboard is not allowed to sign in from this address.";
  }
  return "The admin service could not complete that request.";
}

export async function signIn(client: ApiClient, input: LoginFields) {
  return client.post<AdminSessionResponse>("/api/v1/admin/session", adminSessionResponseSchema, {
    email: input.email,
    password: input.password,
  });
}
