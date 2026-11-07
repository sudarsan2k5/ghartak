"use client";

import { use } from "react";
import { CategoryDetailScreen } from "@/features/categories/category-detail";

export default function CategoryDetailPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = use(params);
  return <CategoryDetailScreen categoryId={categoryId} />;
}
