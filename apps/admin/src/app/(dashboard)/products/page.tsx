"use client";

import { Suspense } from "react";
import { ProductListScreen } from "@/features/products/product-list";

export default function ProductsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-secondary">Loading products</p>}>
      <ProductListScreen />
    </Suspense>
  );
}
