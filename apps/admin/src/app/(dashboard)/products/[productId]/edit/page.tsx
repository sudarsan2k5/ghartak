"use client";

import { useParams } from "next/navigation";
import { ProductEditor } from "@/features/products/product-editor";

export default function EditProductPage() {
  const params = useParams<{ productId: string }>();
  return <ProductEditor mode="edit" productId={params.productId} />;
}