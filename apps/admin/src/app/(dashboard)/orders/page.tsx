"use client";

import { Suspense } from "react";
import { OrderListScreen } from "@/features/orders/order-list";

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-secondary">Loading orders</p>}>
      <OrderListScreen />
    </Suspense>
  );
}
