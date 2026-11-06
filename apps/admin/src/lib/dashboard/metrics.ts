import { adminProductSummarySchema } from "@ghartak/contracts";
import type { z } from "zod";

export type AdminProductSummary = z.infer<typeof adminProductSummarySchema>;

export const stockScanLimit = 200;

export type StockSummary =
  | { status: "counted"; outOfStock: number; attention: AdminProductSummary[] }
  | { status: "unavailable"; reason: string };

export type OverviewData = {
  total: number;
  published: number;
  draft: number;
  archived: number;
  categoryCount: number;
  products: AdminProductSummary[];
  stock: StockSummary;
};

export function canScanStock(total: number): boolean {
  return total <= stockScanLimit;
}

export function stockSummary(total: number, products: readonly AdminProductSummary[]): StockSummary {
  if (!canScanStock(total)) {
    return {
      status: "unavailable",
      reason: "The catalogue is larger than this screen can read in one pass. The product list has no stock filter, so an out-of-stock count would be incomplete.",
    };
  }
  const attention = products.filter(isOutOfStock);
  return { status: "counted", outOfStock: attention.length, attention };
}

export function isOutOfStock(product: AdminProductSummary): boolean {
  return product.inventory.stockQuantity === 0 || product.inventory.availability === "out_of_stock";
}

export type OverviewPhase =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: OverviewData };

export type OverviewView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty"; data: OverviewData }
  | { kind: "ready"; data: OverviewData };

export function overviewView(input: OverviewPhase): OverviewView {
  if (input.phase === "loading") {
    return { kind: "loading" };
  }
  if (input.phase === "error") {
    return { kind: "error", message: input.message };
  }
  if (input.data.total === 0) {
    return { kind: "empty", data: input.data };
  }
  return { kind: "ready", data: input.data };
}
