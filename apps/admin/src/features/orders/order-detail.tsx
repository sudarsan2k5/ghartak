"use client";

import type { AdminOrderDetail } from "@ghartak/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { controlClassName } from "@/components/ui/field";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { formatDeliveryAddress, paymentMethodLabel } from "@/lib/orders/address";
import { beginOrderAction, validateCancelReason } from "@/lib/orders/list-state";
import { cancelOrder, fetchOrder, fetchOrderSummary, updateOrderStatus } from "@/lib/orders/requests";
import { canCancelOrder, nextOrderActionLabel, nextOrderStatus, orderStatusLabel } from "@/lib/orders/status";
import { formatDateTime, formatPaise } from "@/lib/utils/format";

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    void fetchOrder(client, orderId).then(async (result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        if (await redirect(result)) {
          return;
        }
        setError(result.status === 404 ? "This order is not available." : "The order could not be loaded.");
        setLoading(false);
        return;
      }
      setOrder(result.data);
      setError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, orderId, redirect]);

  async function refreshRelated() {
    if (!client) {
      return;
    }
    await fetchOrderSummary(client);
    setAttempt((current) => current + 1);
  }

  async function advance() {
    if (!client || !order || !beginOrderAction(pending)) {
      return;
    }
    const next = nextOrderStatus(order.status);
    if (!next) {
      return;
    }
    setPending(true);
    setNotice(null);
    setError(null);
    const result = await updateOrderStatus(client, order.id, next);
    setPending(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setError(result.kind === "conflict" ? result.message : "The order status could not be updated.");
      return;
    }
    setOrder(result.data);
    setNotice(`Order is now ${orderStatusLabel(result.data.status).toLowerCase()}.`);
    void fetchOrderSummary(client);
  }

  async function confirmCancel() {
    if (!client || !order || !beginOrderAction(pending)) {
      return;
    }
    const reasonError = validateCancelReason(cancelReason);
    if (reasonError) {
      setCancelError(reasonError);
      return;
    }
    setPending(true);
    setCancelError(null);
    setError(null);
    const result = await cancelOrder(client, order.id, cancelReason.trim());
    setPending(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setCancelError(result.kind === "conflict" ? result.message : "The order could not be cancelled.");
      return;
    }
    setOrder(result.data);
    setCancelOpen(false);
    setCancelReason("");
    setNotice("Order cancelled. Inventory was restored.");
    void fetchOrderSummary(client);
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="sr-only">Loading order</p>
        <div className="h-40 animate-pulse rounded-2xl border border-line bg-white" />
        <div className="h-64 animate-pulse rounded-2xl border border-line bg-white" />
      </div>
    );
  }

  if (!order) {
    return (
      <section className="max-w-xl rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
        <h2 className="font-display text-lg font-extrabold">Order unavailable</h2>
        <p className="mt-3 text-sm text-secondary">{error ?? "This order is not available."}</p>
        <div className="mt-5 flex gap-3">
          <Link href="/orders" className="rounded-xl border border-line px-4 py-2 text-sm font-medium">
            Back to orders
          </Link>
          <button type="button" className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white" onClick={() => void refreshRelated()}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  const nextLabel = nextOrderActionLabel(order.status);
  const address = formatDeliveryAddress(order.address);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/orders" className="text-sm font-medium underline-offset-2 hover:underline">
            Back to orders
          </Link>
          <p className="mt-3 max-w-xl text-sm leading-6 text-secondary">
            Totals are the snapshots stored with this order. Current catalogue prices are not used.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {nextLabel ? (
            <button
              type="button"
              className="rounded-xl bg-lime px-4 py-2 font-display text-sm font-semibold text-ink disabled:opacity-60"
              disabled={pending}
              onClick={() => void advance()}
            >
              {pending ? "Working" : nextLabel}
            </button>
          ) : null}
          {canCancelOrder(order.status) ? (
            <button
              type="button"
              className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              disabled={pending}
              onClick={() => {
                setCancelError(null);
                setCancelOpen(true);
              }}
            >
              Cancel order
            </button>
          ) : null}
        </div>
      </div>
      {notice ? (
        <p className="rounded-xl border border-line bg-[#F1F9DA] px-4 py-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-line bg-wash px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-extrabold">Order</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <Row label="Order number" value={order.orderNumber} />
            <Row label="Placed" value={formatDateTime(order.createdAt)} />
            <Row label="Updated" value={formatDateTime(order.updatedAt)} />
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="mt-1">
                <StatusBadge value={order.status} label={orderStatusLabel(order.status)} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Customer type</dt>
              <dd className="mt-1">
                <StatusBadge value={order.customerType} label={order.customerType === "guest" ? "Guest" : "Registered"} />
              </dd>
            </div>
          </dl>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-extrabold">Customer</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <Row label="Name" value={order.customerName} />
            <Row label="Phone" value={order.customerPhone} />
            <div>
              <dt className="text-muted">Delivery address</dt>
              <dd className="mt-1 whitespace-pre-line">{address}</dd>
            </div>
          </dl>
        </article>
      </section>
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-extrabold">Products</h2>
        </div>
        <div className="hidden md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Quantity</th>
                <th className="px-5 py-3 font-medium">Unit price</th>
                <th className="px-5 py-3 font-medium">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.productId} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">{item.productName}</td>
                  <td className="px-5 py-3">{item.quantity}</td>
                  <td className="px-5 py-3">{formatPaise(item.unitPricePaise)}</td>
                  <td className="px-5 py-3">{formatPaise(item.lineTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-line md:hidden">
          {order.items.map((item) => (
            <li key={item.productId} className="px-5 py-4 text-sm">
              <p className="font-medium">{item.productName}</p>
              <p className="mt-1 text-secondary">
                {item.quantity} × {formatPaise(item.unitPricePaise)} = {formatPaise(item.lineTotalPaise)}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-extrabold">Payment</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-muted">Method</dt>
              <dd className="mt-1">
                <StatusBadge value={order.paymentMethod} label={paymentMethodLabel(order.paymentMethod)} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Payment status</dt>
              <dd className="mt-1">
                <StatusBadge value={order.paymentStatus} />
              </dd>
            </div>
            <Row label="Subtotal" value={formatPaise(order.subtotalPaise)} />
            <Row label="Delivery charge" value={formatPaise(order.deliveryFeePaise)} />
            <Row label="Final amount" value={formatPaise(order.totalPaise)} />
          </dl>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-extrabold">Order history</h2>
          <ol className="mt-4 space-y-3">
            {order.statusHistory.map((event, index) => (
              <li key={`${event.createdAt}-${event.toStatus}-${index}`} className="rounded-xl bg-wash px-3 py-3 text-sm">
                <p className="font-medium">{orderStatusLabel(event.toStatus)}</p>
                <p className="text-secondary">{formatDateTime(event.createdAt)}</p>
                {event.actor ? <p className="text-muted">{event.actor.name}</p> : null}
                {event.note ? <p className="mt-1">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        </article>
      </section>
      {cancelOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-order-title" className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-card">
            <h2 id="cancel-order-title" className="font-display text-xl font-extrabold">
              Cancel this order?
            </h2>
            <p className="mt-3 text-sm leading-6 text-secondary">
              Cancellation restores the ordered quantities to central stock. This cannot be undone from the dashboard.
            </p>
            <label className="mt-4 block text-sm font-medium" htmlFor="cancel-reason">
              Reason
            </label>
            <textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              className={`${controlClassName} mt-2 min-h-24`}
              maxLength={200}
              disabled={pending}
            />
            {cancelError ? (
              <p className="mt-2 text-sm text-secondary" role="alert">
                {cancelError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium"
                disabled={pending}
                onClick={() => setCancelOpen(false)}
              >
                Keep order
              </button>
              <button
                type="button"
                className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={pending}
                onClick={() => void confirmCancel()}
              >
                {pending ? "Working" : "Cancel order"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
