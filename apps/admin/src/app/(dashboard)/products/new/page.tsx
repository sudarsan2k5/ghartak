"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ProductEditor } from "@/features/products/product-editor";

function NewProduct() {
  const categoryId = useSearchParams().get("category");
  return <ProductEditor key={categoryId ?? "any"} mode="create" {...(categoryId ? { fixedCategoryId: categoryId } : {})} />;
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<p className="text-sm text-secondary">Loading the product form</p>}>
      <NewProduct />
    </Suspense>
  );
}
