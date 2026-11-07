"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { controlClassName } from "@/components/ui/field";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { formatCount, formatPaise } from "@/lib/utils/format";
import { categoryOptionLabel } from "@/lib/categories/form";
import { archiveConfirmed, productListView, type ArchivePrompt, type ProductListView } from "@/lib/products/list-state";
import { filtersFromSearchParams, type ProductListFilters } from "@/lib/products/query";
import { archiveProduct, fetchCategories, fetchProductPage } from "@/lib/products/requests";

export function ProductListScreen() {
  const params = useSearchParams();
  const filters = filtersFromSearchParams(params);
  const router = useRouter();
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [view, setView] = useState<ProductListView>({ kind: "loading" });
  const [categories, setCategories] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState(filters.search);
  const [archive, setArchive] = useState<ArchivePrompt | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    void Promise.all([fetchProductPage(client, filters), fetchCategories(client)]).then(async ([page, categoryResult]) => {
      if (cancelled) {
        return;
      }
      if (!page.ok) {
        if (await redirect(page)) {
          return;
        }
        setView(productListView({ phase: "error", message: "The product list could not be loaded." }));
        return;
      }
      if (categoryResult.ok) {
        setCategories(categoryResult.data.categories);
      }
      setView(productListView({ phase: "ready", data: page.data }));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, filters.categoryId, filters.page, filters.publicationStatus, filters.search, redirect]);

  function visit(next: Partial<ProductListFilters>, resetPage = true) {
    const merged: ProductListFilters = {
      ...filters,
      ...next,
      page: resetPage ? 1 : (next.page ?? filters.page),
    };
    const query = new URLSearchParams();
    if (merged.page > 1) {
      query.set("page", String(merged.page));
    }
    if (merged.search.trim()) {
      query.set("q", merged.search.trim());
    }
    if (merged.publicationStatus) {
      query.set("status", merged.publicationStatus);
    }
    if (merged.categoryId) {
      query.set("category", merged.categoryId);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    router.push(`/products${suffix}`);
  }

  async function confirmArchive() {
    const productId = archiveConfirmed(archive, true);
    if (!client || !productId) {
      return;
    }
    setArchiving(true);
    setArchiveError(null);
    const result = await archiveProduct(client, productId);
    setArchiving(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setArchiveError(result.message);
      return;
    }
    setArchive(null);
    setAttempt((current) => current + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <p className="max-w-xl text-sm leading-6 text-secondary">
          One central price and one stock quantity for every product. The list shows one page at a time.
        </p>
        <Link href="/products/new" className="inline-flex h-11 items-center justify-center rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink">
          Add a product
        </Link>
      </div>
      <form
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-card md:grid-cols-[minmax(0,1.4fr)_180px_200px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          visit({ search });
        }}
      >
        <div>
          <label className="text-sm font-medium" htmlFor="product-search">
            Search
          </label>
          <input
            id="product-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or brand"
            className={`${controlClassName} mt-2`}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="product-status">
            Status
          </label>
          <select
            id="product-status"
            className={`${controlClassName} mt-2`}
            value={filters.publicationStatus}
            onChange={(event) => visit({ publicationStatus: event.target.value as ProductListFilters["publicationStatus"] })}
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="product-category">
            Category
          </label>
          <select
            id="product-category"
            className={`${controlClassName} mt-2`}
            value={filters.categoryId}
            onChange={(event) => visit({ categoryId: event.target.value })}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryOptionLabel(category)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="h-12 w-full rounded-xl bg-ink px-4 text-sm font-medium text-white md:w-auto">
            Search
          </button>
        </div>
      </form>
      {archiveError ? (
        <p className="rounded-xl border border-line bg-wash px-4 py-3 text-sm" role="alert">
          {archiveError}
        </p>
      ) : null}
      {view.kind === "loading" ? <ListSkeleton /> : null}
      {view.kind === "error" ? (
        <section className="rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
          <h2 className="font-display text-lg font-extrabold">Products unavailable</h2>
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
          <p className="mt-2 text-sm text-secondary">Try another search, or add a product to the central catalogue.</p>
        </section>
      ) : null}
      {view.kind === "ready" ? (
        <>
          <ProductTable
            products={view.data.products}
            onArchive={(product) => setArchive({ productId: product.id, name: product.name })}
          />
          <Pagination
            page={view.data.pagination.page}
            pageCount={view.data.pagination.pageCount}
            total={view.data.pagination.total}
            onPage={(page) => visit({ page }, false)}
          />
        </>
      ) : null}
      {archive ? (
        <ConfirmDialog
          title={`Archive ${archive.name}?`}
          body="Archiving hides the product from customers. The price, stock, and order history stay in place. This does not delete the product."
          confirmLabel="Archive product"
          pending={archiving}
          onCancel={() => {
            if (!archiving) {
              setArchive(null);
            }
          }}
          onConfirm={() => void confirmArchive()}
        />
      ) : null}
    </div>
  );
}

function ProductTable({
  products,
  onArchive,
}: {
  products: Extract<ProductListView, { kind: "ready" }>["data"]["products"];
  onArchive: (product: Extract<ProductListView, { kind: "ready" }>["data"]["products"][number]) => void;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-card md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Brand</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ProductMark name={product.name} />
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-muted">{product.packageLabel}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{product.category.name}</td>
                <td className="px-4 py-3">{product.brand ?? "—"}</td>
                <td className="px-4 py-3">{formatPaise(product.inventory.pricePaise)}</td>
                <td className="px-4 py-3">{formatCount(product.inventory.stockQuantity)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge value={product.publicationStatus} />
                    <StatusBadge value={product.inventory.availability} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RowActions productId={product.id} archived={product.publicationStatus === "archived"} onArchive={() => onArchive(product)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {products.map((product) => (
          <li key={product.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <div className="flex items-start gap-3">
              <ProductMark name={product.name} />
              <div className="min-w-0">
                <p className="font-medium">{product.name}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Category</dt>
                <dd>{product.category.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Brand</dt>
                <dd>{product.brand ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Price</dt>
                <dd>{formatPaise(product.inventory.pricePaise)}</dd>
              </div>
              <div>
                <dt className="text-muted">Stock</dt>
                <dd>{formatCount(product.inventory.stockQuantity)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge value={product.publicationStatus} />
              <StatusBadge value={product.inventory.availability} />
            </div>
            <div className="mt-4">
              <RowActions productId={product.id} archived={product.publicationStatus === "archived"} onArchive={() => onArchive(product)} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Product photos are on the product page. This list does not include image fields.</p>
    </>
  );
}

function ProductMark({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-wash font-display text-sm font-extrabold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function RowActions({ productId, archived, onArchive }: { productId: string; archived: boolean; onArchive: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/products/${productId}`} className="rounded-lg px-2 py-1 text-sm font-medium underline-offset-2 hover:underline">
        View
      </Link>
      <Link href={`/products/${productId}/edit`} className="rounded-lg px-2 py-1 text-sm font-medium underline-offset-2 hover:underline">
        Edit
      </Link>
      {archived ? null : (
        <button type="button" className="rounded-lg px-2 py-1 text-sm font-medium text-secondary underline-offset-2 hover:underline" onClick={onArchive}>
          Archive
        </button>
      )}
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
        Page {formatCount(page)} of {formatCount(Math.max(pageCount, 1))} · {formatCount(total)} products
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
      <p className="sr-only">Loading products</p>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-2xl border border-line bg-white" />
      ))}
    </div>
  );
}
