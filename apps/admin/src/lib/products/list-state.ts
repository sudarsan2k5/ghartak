import type { AdminProductSummary } from "../dashboard/metrics";

export type ProductPage = {
  products: AdminProductSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pageCount: number;
  };
};

export type ProductListPhase =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: ProductPage };

export type ProductListView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; data: ProductPage };

export function productListView(input: ProductListPhase): ProductListView {
  if (input.phase === "loading") {
    return { kind: "loading" };
  }
  if (input.phase === "error") {
    return { kind: "error", message: input.message };
  }
  if (input.data.products.length === 0) {
    return { kind: "empty" };
  }
  return { kind: "ready", data: input.data };
}

export type ArchivePrompt = {
  productId: string;
  name: string;
};

export function archiveConfirmed(prompt: ArchivePrompt | null, confirmed: boolean): string | null {
  if (!prompt || !confirmed) {
    return null;
  }
  return prompt.productId;
}
