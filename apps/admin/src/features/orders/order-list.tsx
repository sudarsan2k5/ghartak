"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { controlClassName } from "@/components/ui/field";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { orderListView, type OrderListView } from "@/lib/orders/list-state";
import { filtersFromSearchParams, orderRefreshMs, ordersPageHref, type OrderListFilters } from "@/lib/orders/query";
import { fetchOrderPage, fetchOrderSummary } from "@/lib/orders/requests";
import { paymentMethodLabel } from "@/lib/orders/address";
import { nextOrderActionLabel, orderStatusLabel } from "@/lib/orders/status";
import { formatCount, formatDateTime, formatPaise } from "@/lib/utils/format";
import type { AdminOrderListItem, AdminOrderSummary } from "@ghartak/contracts";

export function OrderListScreen() {
  const params = useSearchParams();
  const filters = filtersFromSearchParams(params);
  const router = useRouter();
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [view, setView] = useState<OrderListView>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    setDraft(filters);
  }, [
    filters.page,
    filters.orderNumber,
    filters.customerName,
    filters.customerPhone,
    filters.status,
    filters.paymentStatus,
    filters.paymentMethod,
    filters.customerType,
    filters.createdFrom,
    filters.createdTo,
  ]);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    const silent = view.kind === "ready" || view.kind === "empty";
    void Promise.all([fetchOrderPage(client, filters), fetchOrderSummary(client)]).then(async ([page, summary]) => {
      if (cancelled) {
        return;
      }
      if (!page.ok) {
        if (await redirect(page)) {
          return;
        }
        if (!silent) {
          setView(orderListView({ phase: "error", message: "The order list could not be loaded." }));
        }
        return;
      }
      setView(
        orderListView({
          phase: "ready",
          data: page.data,
          summary: summary.ok ? summary.data : null,
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    attempt,
    client,
    filters.page,
    filters.orderNumber,
    filters.customerName,
    filters.customerPhone,
    filters.status,
    filters.paymentStatus,
    filters.paymentMethod,
    filters.customerType,
    filters.createdFrom,
    filters.createdTo,
    redirect,
  ]);

  useEffect(() => {
    if (!client) {
      return;
    }
    function onTick() {
      if (document.visibilityState === "hidden") {
        return;
      }
      setAttempt((current) => current + 1);
    }
    const timer = window.setInterval(onTick, orderRefreshMs);
    document.addEventListener("visibilitychange", onTick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onTick);
    };
  }, [client]);

  function visit(next: Partial<OrderListFilters>, resetPage = true) {
    const merged: OrderListFilters = {
      ...filters,
      ...next,
      page: resetPage ? 1 : (next.page ?? filters.page),
    };
    router.push(ordersPageHref(merged));
  }

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm leading-6 text-secondary">
        Every guest and registered order from the central catalogue. New orders stay highlighted until they are confirmed.
        Unpaid COD is not counted as collected money.
      </p>
      <SummaryCards summary={view.kind === "ready" || view.kind === "empty" ? view.summary : null} loading={view.kind === "loading"} />
      <form
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-card md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          visit({
            orderNumber: draft.orderNumber,
            customerName: draft.customerName,
            customerPhone: draft.customerPhone,
            createdFrom: draft.createdFrom,
            createdTo: draft.createdTo,
          });
        }}
      >
        <FilterField id="order-number" label="Order number">
          <input id="order-number" value={draft.orderNumber} onChange={(event) => setDraft({ ...draft, orderNumber: event.target.value })} className={controlClassName} />
        </FilterField>
        <FilterField id="order-name" label="Customer name">
          <input id="order-name" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} className={controlClassName} />
        </FilterField>
        <FilterField id="order-phone" label="Phone">
          <input id="order-phone" value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} className={controlClassName} />
        </FilterField>
        <FilterField id="order-status" label="Status">
          <select id="order-status" className={controlClassName} value={filters.status} onChange={(event) => visit({ status: event.target.value })}>
            <option value="">All</option>
            <option value="placed">New</option>
            <option value="confirmed">Confirmed</option>
            <option value="packed">Preparing</option>
            <option value="out_for_delivery">Out for delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </FilterField>
        <FilterField id="order-payment-status" label="Payment status">
          <select
            id="order-payment-status"
            className={controlClassName}
            value={filters.paymentStatus}
            onChange={(event) => visit({ paymentStatus: event.target.value })}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </FilterField>
        <FilterField id="order-method" label="Payment method">
          <select id="order-method" className={controlClassName} value={filters.paymentMethod} onChange={(event) => visit({ paymentMethod: event.target.value })}>
            <option value="">All</option>
            <option value="cash_on_delivery">Cash on delivery</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="net_banking">Net banking</option>
          </select>
        </FilterField>
        <FilterField id="order-type" label="Customer type">
          <select id="order-type" className={controlClassName} value={filters.customerType} onChange={(event) => visit({ customerType: event.target.value })}>
            <option value="">All</option>
            <option value="guest">Guest</option>
            <option value="registered">Registered</option>
          </select>
        </FilterField>
        <FilterField id="order-from" label="From">
          <input id="order-from" type="date" value={draft.createdFrom} onChange={(event) => setDraft({ ...draft, createdFrom: event.target.value })} className={controlClassName} />
        </FilterField>
        <FilterField id="order-to" label="To">
          <input id="order-to" type="date" value={draft.createdTo} onChange={(event) => setDraft({ ...draft, createdTo: event.target.value })} className={controlClassName} />
        </FilterField>
        <div className="flex items-end">
          <button type="submit" className="h-12 w-full rounded-xl bg-ink px-4 text-sm font-medium text-white">
            Search
          </button>
        </div>
      </form>
      {view.kind === "loading" ? <ListSkeleton /> : null}
      {view.kind === "error" ? (
        <section className="rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
          <h2 className="font-display text-lg font-extrabold">Orders unavailable</h2>
          <p className="mt-3 text-sm text-secondary">{view.message}</p>
          <button
            type="button"
            className="mt-5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              setView({ kind: "loading" });
              setAttempt((current) => current + 1);
            }}
          >
            Try again
          </button>
        </section>
      ) : null}
      {view.kind === "empty" ? (
        <section className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <h2 className="font-display text-lg font-extrabold">No orders match</h2>
          <p className="mt-2 text-sm text-secondary">Try another search, or wait for a customer to place an order.</p>
        </section>
      ) : null}
      {view.kind === "ready" ? (
        <>
          <OrderTable orders={view.data.orders} />
          <Pagination
            page={view.data.pagination.page}
            pageCount={view.data.pagination.pageCount}
            total={view.data.pagination.total}
            onPage={(page) => visit({ page }, false)}
          />
        </>
      ) : null}
    </div>
  );
}

function SummaryCards({ summary, loading }: { summary: AdminOrderSummary | null; loading: boolean }) {
  if (loading && !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
        <p className="sr-only">Loading order totals</p>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-line bg-white" />
        ))}
      </div>
    );
  }
  if (!summary) {
    return null;
  }
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Order totals">
      <Metric label="Total orders" value={formatCount(summary.totalOrders)} hint="Guest and registered" />
      <Metric label="New orders" value={formatCount(summary.placed)} hint="Status placed" />
      <Metric label="Confirmed" value={formatCount(summary.confirmed)} hint="Ready to prepare" />
      <Metric label="Preparing" value={formatCount(summary.packed)} hint="Status packed" />
      <Metric label="Out for delivery" value={formatCount(summary.outForDelivery)} hint="On the way" />
      <Metric label="Delivered" value={formatCount(summary.delivered)} hint="Completed" />
      <Metric label="Cancelled" value={formatCount(summary.cancelled)} hint="Stock restored" />
      <Metric
        label="COD awaiting collection"
        value={formatPaise(summary.codAwaitingCollectionPaise)}
        hint={`${formatCount(summary.codAwaitingPaymentCount)} unpaid COD orders. Not collected revenue.`}
      />
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <h2 className="text-sm font-medium text-muted">{label}</h2>
      <p className="mt-3 font-display text-3xl font-extrabold">{value}</p>
      <p className="mt-2 text-sm leading-5 text-secondary">{hint}</p>
    </article>
  );
}

function OrderTable({ orders }: { orders: AdminOrderListItem[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-card md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Order number</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Customer type</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Total amount</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Order status</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className={`border-b border-line last:border-0 ${order.status === "placed" ? "bg-lime/30" : ""}`}>
                <td className="px-4 py-3 font-medium">{order.orderNumber}</td>
                <td className="px-4 py-3">
                  <p>{order.customerName}</p>
                  <p className="text-muted">{order.customerPhone}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge value={order.customerType} label={order.customerType === "guest" ? "Guest" : "Registered"} />
                </td>
                <td className="px-4 py-3">{formatCount(order.itemCount)}</td>
                <td className="px-4 py-3">{formatPaise(order.totalPaise)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge value={order.paymentMethod} label={paymentMethodLabel(order.paymentMethod)} />
                    <StatusBadge value={order.paymentStatus} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge value={order.status} label={orderStatusLabel(order.status)} />
                </td>
                <td className="px-4 py-3">{formatDateTime(order.createdAt)}</td>
                <td className="px-4 py-3">
                  <OrderActions order={order} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {orders.map((order) => (
          <li key={order.id} className={`rounded-2xl border border-line bg-white p-4 shadow-card ${order.status === "placed" ? "ring-2 ring-lime" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <p className="text-sm text-secondary">{order.customerName}</p>
              </div>
              <StatusBadge value={order.status} label={orderStatusLabel(order.status)} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Type</dt>
                <dd className="capitalize">{order.customerType}</dd>
              </div>
              <div>
                <dt className="text-muted">Items</dt>
                <dd>{formatCount(order.itemCount)}</dd>
              </div>
              <div>
                <dt className="text-muted">Total</dt>
                <dd>{formatPaise(order.totalPaise)}</dd>
              </div>
              <div>
                <dt className="text-muted">Date</dt>
                <dd>{formatDateTime(order.createdAt)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge value={order.customerType} label={order.customerType === "guest" ? "Guest" : "Registered"} />
              <StatusBadge value={order.paymentStatus} />
            </div>
            <div className="mt-4">
              <OrderActions order={order} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function OrderActions({ order }: { order: AdminOrderListItem }) {
  const next = nextOrderActionLabel(order.status);
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/orders/${order.id}`} className="rounded-lg px-2 py-1 text-sm font-medium underline-offset-2 hover:underline">
        View
      </Link>
      {next ? <span className="rounded-lg px-2 py-1 text-sm text-muted">{next}</span> : null}
    </div>
  );
}

function FilterField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm text-secondary sm:flex-row sm:items-center sm:justify-between">
      <p>
        Page {formatCount(page)} of {formatCount(Math.max(pageCount, 1))} · {formatCount(total)} orders
      </p>
      <div className="flex gap-2">
        <button type="button" className="rounded-xl border border-line bg-white px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button
          type="button"
          className="rounded-xl border border-line bg-white px-3 py-2 disabled:opacity-40"
          disabled={pageCount === 0 || page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading orders</p>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-2xl border border-line bg-white" />
      ))}
    </div>
  );
}
