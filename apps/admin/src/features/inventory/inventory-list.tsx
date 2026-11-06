"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { controlClassName } from "@/components/ui/field";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { inventoryQuerySupport } from "@/lib/inventory/stock";
import { productListView, type ProductListView } from "@/lib/products/list-state";
import { filtersFromSearchParams, type ProductListFilters } from "@/lib/products/query";
import { fetchProductPage } from "@/lib/products/requests";
import { formatCount } from "@/lib/utils/format";
import { StockAdjustment, type StockTarget } from "./stock-adjustment";

export function InventoryListScreen() {
  const params = useSearchParams();
  const filters = filtersFromSearchParams(params);
  const router = useRouter();
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [view, setView] = useState<ProductListView>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState(filters.search);
  const [target, setTarget] = useState<StockTarget | null>(null);
  const [recorded, setRecorded] = useState<string | null>(null);

  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    void fetchProductPage(client, { ...filters, publicationStatus: "", categoryId: "" }).then(async (page) => {
      if (cancelled) {
        return;
      }
      if (!page.ok) {
        if (await redirect(page)) {
          return;
        }
        setView(productListView({ phase: "error", message: "The inventory list could not be loaded." }));
        return;
      }
      setView(productListView({ phase: "ready", data: page.data }));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, filters.page, filters.search, redirect]);

  function visit(next: Partial<ProductListFilters>, resetPage = true) {
    const page = resetPage ? 1 : (next.page ?? filters.page);
    const query = new URLSearchParams();
    const term = (next.search ?? filters.search).trim();
    if (page > 1) {
      query.set("page", String(page));
    }
    if (term) {
      query.set("q", term);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    router.push(`/inventory${suffix}`);
  }

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm leading-6 text-secondary">
        One central stock quantity for every product. Search and pages use the product list. That list has no stock or availability filter, so those filters are not shown here.
      </p>
      <form
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:grid-cols-[minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          visit({ search });
        }}
      >
        <div>
          <label className="text-sm font-medium" htmlFor="inventory-search">
            Search
          </label>
          <input
            id="inventory-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, brand, or SKU"
            className={`${controlClassName} mt-2`}
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className="h-12 w-full rounded-xl bg-ink px-4 text-sm font-medium text-white sm:w-auto">
            Search
          </button>
        </div>
      </form>
      {recorded ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm">{recorded}</p> : null}
      {view.kind === "loading" ? <InventorySkeleton /> : null}
      {view.kind === "error" ? (
        <section className="rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
          <h2 className="font-display text-lg font-extrabold">Inventory unavailable</h2>
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
          <h2 className="font-display text-lg font-extrabold">No products match</h2>
          <p className="mt-2 text-sm text-secondary">Try another name, brand, or SKU.</p>
        </section>
      ) : null}
      {view.kind === "ready" ? (
        <>
          <InventoryTable
            products={view.data.products}
            onAdjust={(product) => {
              setRecorded(null);
              setTarget({
                id: product.id,
                name: product.name,
                stockQuantity: product.inventory.stockQuantity,
                packageLabel: product.packageLabel,
              });
            }}
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted">
              Page {view.data.pagination.page} of {view.data.pagination.pageCount} · {view.data.pagination.total} products
            </p>
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border border-line bg-white px-3 py-2 disabled:opacity-40" disabled={view.data.pagination.page <= 1} onClick={() => visit({ page: view.data.pagination.page - 1 }, false)}>
                Previous
              </button>
              <button type="button" className="rounded-xl border border-line bg-white px-3 py-2 disabled:opacity-40" disabled={view.data.pagination.page >= view.data.pagination.pageCount} onClick={() => visit({ page: view.data.pagination.page + 1 }, false)}>
                Next
              </button>
            </div>
          </div>
          <p className="text-sm text-muted">
            {inventoryQuerySupport.movementHistory
              ? "Movement history is listed with each product."
              : "Movement history is not available from the admin API. Each adjustment still writes a ledger row on the server."}
          </p>
        </>
      ) : null}
      {target ? (
        <StockAdjustment
          product={target}
          onClose={() => setTarget(null)}
          onApplied={(inventory) => {
            setRecorded(`${target.name} now has ${formatCount(inventory.stockQuantity)} in stock.`);
            setAttempt((current) => current + 1);
          }}
          onRefresh={() => setAttempt((current) => current + 1)}
        />
      ) : null}
    </div>
  );
}

function InventoryTable({
  products,
  onAdjust,
}: {
  products: Extract<ProductListView, { kind: "ready" }>["data"]["products"];
  onAdjust: (product: Extract<ProductListView, { kind: "ready" }>["data"]["products"][number]) => void;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-card md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 font-medium">Availability</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-muted">{product.packageLabel}</p>
                </td>
                <td className="px-4 py-3">{product.sku}</td>
                <td className="px-4 py-3">{product.category.name}</td>
                <td className="px-4 py-3">{formatCount(product.inventory.stockQuantity)}</td>
                <td className="px-4 py-3">{product.unit}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={product.inventory.availability} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded-xl bg-lime px-3 py-2 font-display text-sm font-semibold text-ink" onClick={() => onAdjust(product)}>
                      Adjust
                    </button>
                    <Link href={`/products/${product.id}`} className="rounded-xl border border-line px-3 py-2 text-sm">
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {products.map((product) => (
          <li key={product.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <p className="font-medium">{product.name}</p>
            <p className="text-sm text-muted">{product.sku}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Category</dt>
                <dd>{product.category.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Stock</dt>
                <dd>{formatCount(product.inventory.stockQuantity)}</dd>
              </div>
              <div>
                <dt className="text-muted">Unit</dt>
                <dd>
                  {product.unit} · {product.packageLabel}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Availability</dt>
                <dd className="mt-1">
                  <StatusBadge value={product.inventory.availability} />
                </dd>
              </div>
            </dl>
            <button type="button" className="mt-4 h-11 w-full rounded-xl bg-lime font-display text-sm font-semibold text-ink" onClick={() => onAdjust(product)}>
              Adjust stock
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function InventorySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading inventory</p>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-2xl border border-line bg-white" />
      ))}
    </div>
  );
}
