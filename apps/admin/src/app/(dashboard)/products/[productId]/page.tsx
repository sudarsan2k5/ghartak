"use client";

import { useParams } from "next/navigation";
import { ProductDetail } from "@/features/products/product-detail";

export default function ProductPage() {
  const params = useParams<{ productId: string }>();
  return <ProductDetail productId={params.productId} />;
}
