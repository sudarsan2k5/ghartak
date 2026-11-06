"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/features/auth/session-provider";
import { loadOverview } from "@/lib/dashboard/load-overview";
import { overviewView, type OverviewData, type OverviewView } from "@/lib/dashboard/metrics";
import { formatCount, formatPaise } from "@/lib/utils/format";

export function OverviewScreen() {
  const { client, refresh } = useSession();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<OverviewView>({ kind: "loading" });

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    void loadOverview(client).then(async (result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        if (result.kind === "auth") {
          await refresh();
          router.replace("/login");
          return;
        }
        setView(overviewView({ phase: "error", message: result.message }));
        return;
      }
      setView(overviewView({ phase: "ready", data: result.data }));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, refresh, router]);

  if (view.kind === "loading") {
    return <OverviewLoading />;
  }
  if (view.kind === "error") {
    return (
      <section className="max-w-xl rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
        <h2 className="font-display text-lg font-extrabold">Catalogue unavailable</h2>
        <p className="mt-3 text-sm leading-6 text-secondary">{view.message}</p>
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
    );
  }

  return <OverviewReady data={view.data} empty={view.kind === "empty"} />;
}

function OverviewReady({ data, empty }: { data: OverviewData; empty: boolean }) {
  const outOfStock = data.stock.status === "counted" ? formatCount(data.stock.outOfStock) : "Unavailable";
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <p className="max-w-xl text-sm leading-6 text-secondary">
          One catalogue, one price, and one stock quantity for every product.
        </p>
        <Link href="/products/new" className="inline-flex h-11 items-center justify-center rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink">
          Add a product
        </Link>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Catalogue totals">
        <Metric label="Total products" value={formatCount(data.total)} hint="Includes drafts and archived products" />
        <Metric label="Published" value={formatCount(data.published)} hint="Visible when the category is active" />
        <Metric label="Drafts" value={formatCount(data.draft)} hint="Hidden from the customer app" />
        <Metric label="Archived" value={formatCount(data.archived)} hint="Kept for stock and order history" />
        <Metric label="Categories" value={formatCount(data.categoryCount)} hint="Includes inactive categories" />
        <Metric
          label="Out of stock"
          value={outOfStock}
          hint={data.stock.status === "counted" ? "Zero quantity or marked out of stock" : data.stock.reason}
        />
      </section>
      <p className="text-sm text-muted">Low stock is omitted. The catalogue API does not define a low-stock threshold.</p>
      {empty ? (
        <section className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <h2 className="font-display text-lg font-extrabold">No products yet</h2>
          <p className="mt-2 text-sm text-secondary">The central catalogue is empty.</p>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <h2 className="font-display text-lg font-extrabold">Products</h2>
            <p className="mt-1 text-sm text-muted">Alphabetical. The list does not include a created time.</p>
            <ul className="mt-4 divide-y divide-line">
              {data.products.map((product) => (
                <li key={product.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{product.name}</p>
                    <p className="text-sm text-muted">
                      {product.category.name} · {product.packageLabel}
                    </p>
                  </div>
                  <div className="text-sm text-secondary sm:text-right">
                    <p>{formatPaise(product.inventory.pricePaise)}</p>
                    <p className="capitalize">{product.publicationStatus.replaceAll("_", " ")} · {product.inventory.stockQuantity} in stock</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <StockAttention data={data} />
        </div>
      )}
    </div>
  );
}

function StockAttention({ data }: { data: OverviewData }) {
  if (data.stock.status === "unavailable") {
    return (
      <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-extrabold">Stock attention</h2>
        <p className="mt-3 text-sm leading-6 text-secondary">{data.stock.reason}</p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <h2 className="font-display text-lg font-extrabold">Stock attention</h2>
      {data.stock.attention.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-secondary">No product is out of stock.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.stock.attention.map((product) => (
            <li key={product.id} className="rounded-xl bg-wash px-3 py-3">
              <p className="font-medium">{product.name}</p>
              <p className="text-sm text-secondary">
                {product.inventory.stockQuantity} in stock · {product.inventory.availability.replaceAll("_", " ")}
              </p>
            </li>
          ))}
        </ul>
      )}
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

function OverviewLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading catalogue totals</p>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-32 animate-pulse rounded-2xl border border-line bg-white" />
      ))}
    </div>
  );
}
