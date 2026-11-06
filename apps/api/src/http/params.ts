import { z } from "zod";

export const routeUuidSchema = z.uuid();

export function routeParam(params: unknown, key: string): unknown {
  if (typeof params === "object" && params !== null && key in params) {
    return params[key as keyof typeof params];
  }
  return undefined;
}
