import { HttpError } from "./errors.js";

export function parseRequest<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (!isZodError(error)) {
      throw error;
    }
    const issue = error.issues[0];
    const path = issue ? issue.path.map((part) => String(part)).join(".") : "request";
    const message = issue ? `${path}: ${issue.message}` : "Invalid request";
    throw new HttpError(400, message);
  }
}

function isZodError(error: unknown): error is { issues: Array<{ path: Array<PropertyKey>; message: string }> } {
  if (typeof error !== "object" || error === null || !("issues" in error)) {
    return false;
  }
  const named = error as { name?: unknown; issues?: unknown };
  return named.name === "ZodError" && Array.isArray(named.issues);
}
