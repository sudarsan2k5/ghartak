import { adminStockChangeSchema, type AdminStockChange } from "@ghartak/contracts";
import type { ApiFailureKind } from "../api/client";

export const inventoryQuerySupport = {
  search: true,
  pagination: true,
  outOfStock: false,
  availability: false,
  movementHistory: false,
} as const;

export type StockMovementType = "addition" | "removal" | "adjustment";

export type StockDraft = {
  type: StockMovementType;
  amount: string;
  reason: string;
};

export type StockProjection = {
  payload: AdminStockChange;
  delta: number;
  next: number;
};

const amountPattern = /^-?\d+$/;

export function emptyStockDraft(): StockDraft {
  return { type: "addition", amount: "", reason: "" };
}

export function buildStockChange(current: number, draft: StockDraft): { ok: true; projection: StockProjection } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const amount = draft.amount.trim();
  const reason = draft.reason.trim();
  let delta: number | null = null;

  if (!amountPattern.test(amount)) {
    errors["amount"] = draft.type === "adjustment" ? "Enter a whole number other than zero." : "Enter a whole number greater than zero.";
  } else {
    const parsed = Number(amount);
    if (!Number.isSafeInteger(parsed)) {
      errors["amount"] = "Enter a smaller whole number.";
    } else if (draft.type === "adjustment" && parsed === 0) {
      errors["amount"] = "Enter a whole number other than zero.";
    } else if (draft.type !== "adjustment" && parsed <= 0) {
      errors["amount"] = "Enter a whole number greater than zero.";
    } else if (draft.type === "adjustment" && (parsed < -1_000_000 || parsed > 1_000_000)) {
      errors["amount"] = "Enter a quantity between -1000000 and 1000000.";
    } else if (draft.type !== "adjustment" && parsed > 1_000_000) {
      errors["amount"] = "Enter a quantity up to 1000000.";
    } else {
      delta = draft.type === "removal" ? -parsed : parsed;
    }
  }

  if (reason.length === 0) {
    errors["reason"] = "A reason is required.";
  } else if (reason.length > 200) {
    errors["reason"] = "Use 200 characters or fewer.";
  }

  if (delta !== null && current + delta < 0) {
    errors["amount"] = "This would make stock negative.";
  }

  if (Object.keys(errors).length > 0 || delta === null) {
    return { ok: false, errors };
  }

  const candidate =
    draft.type === "adjustment"
      ? { type: "adjustment" as const, quantityDelta: delta, reason }
      : draft.type === "addition"
        ? { type: "addition" as const, quantity: delta, reason }
        : { type: "removal" as const, quantity: -delta, reason };
  const parsed = adminStockChangeSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errors: { form: "The stock change does not match the catalogue rules." } };
  }
  return { ok: true, projection: { payload: parsed.data, delta, next: current + delta } };
}

export function planStockFailure(kind: ApiFailureKind): { refreshProduct: boolean; submitAgain: false } {
  return { refreshProduct: kind === "conflict", submitAgain: false };
}
