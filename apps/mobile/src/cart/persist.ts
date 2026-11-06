import { z } from "zod";

import type { CartDisplay, CartItem, CartSnapshot } from "./types";

const productIdSchema = z.uuid();
const displaySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    packageLabel: z.string().trim().min(1).max(80),
    deliveryPath: z.string().nullable(),
  })
  .strict();

export function persistCart(items: readonly CartItem[]): CartSnapshot {
  return {
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      display: item.display,
    })),
  };
}

export function restoreCart(raw: unknown): CartItem[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const record = raw as Record<string, unknown>;
  const nested =
    record["state"] && typeof record["state"] === "object" && !Array.isArray(record["state"])
      ? (record["state"] as Record<string, unknown>)["items"]
      : undefined;
  const rows = Array.isArray(record["items"]) ? record["items"] : nested;
  if (!Array.isArray(rows)) {
    return [];
  }
  const seen = new Map<string, CartItem>();
  for (const row of rows) {
    const item = parseItem(row);
    if (!item) {
      continue;
    }
    const existing = seen.get(item.productId);
    if (existing) {
      seen.set(item.productId, { ...existing, quantity: existing.quantity + item.quantity, display: item.display ?? existing.display });
      continue;
    }
    seen.set(item.productId, item);
  }
  return [...seen.values()];
}

function parseItem(value: unknown): CartItem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = productIdSchema.safeParse(record["productId"]);
  if (!id.success) {
    return null;
  }
  const quantity = record["quantity"];
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1) {
    return null;
  }
  return {
    productId: id.data,
    quantity,
    display: parseDisplay(record["display"]),
  };
}

function parseDisplay(value: unknown): CartDisplay | null {
  const parsed = displaySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
