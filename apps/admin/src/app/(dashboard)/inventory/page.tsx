"use client";

import { Suspense } from "react";
import { InventoryListScreen } from "@/features/inventory/inventory-list";

export default function InventoryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-secondary">Loading inventory</p>}>
      <InventoryListScreen />
    </Suspense>
  );
}
