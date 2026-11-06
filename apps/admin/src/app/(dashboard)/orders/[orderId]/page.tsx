"use client";

import { useParams } from "next/navigation";
import { OrderDetailScreen } from "@/features/orders/order-detail";

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  return <OrderDetailScreen orderId={orderId} />;
}
