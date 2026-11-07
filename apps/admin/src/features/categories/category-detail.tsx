"use client";

import { adminProductSummarySchema } from "@ghartak/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlClassName } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { CategoryEditor, type Category } from "@/features/categories/category-screen";
import { readImageBaseUrl, resolveProductImage } from "@/lib/products/images";
import { archiveProduct, fetchCategories, fetchProductPage, publishProduct } from "@/lib/products/requests";
import { formatCount, formatPaise } from "@/lib/utils/format";

type Product = z.infer<typeof adminProductSummarySchema>;

export function CategoryDetailScreen({ categoryId }: { categoryId: string }) {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const imageBase = readImageBaseUrl();

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.all([
        fetchCategories(client),
        fetchProductPage(client, { page, search, publicationStatus: "", categoryId }),
      ]).then(async ([categoryResult, productResult]) => {
        if (cancelled) {
          return;
        }
        if (!categoryResult.ok || !productResult.ok) {
          const failure = !categoryResult.ok ? categoryResult : productResult;
          if (!failure.ok && (await redirect(failure))) {
            return;
          }
          setError("This category could not be loaded.");
          return;
        }
        const found = categoryResult.data.categories.find((row) => row.id === categoryId);
        if (!found) {
          setError("This category no longer exists.");
          return;
        }
        setError(null);
        setCategory(found);
        setProducts(productResult.data.products);
        setPageCount(productResult.data.pagination.pageCount);
        setTotal(productResult.data.pagination.total);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attempt, categoryId, client, page, redirect, search]);

  async function makeLive(product: Product) {
    if (!client || busy) {
      return;
    }
    setBusy(true);
    const result = await publishProduct(client, product.id);
    setBusy(false);
    if (!result.ok) {
      if (!(await redirect(result))) {
        setNotice(result.message);
      }
      return;
    }
    setNotice(`${product.name} is now in the customer app.`);
    setAttempt((value) => value + 1);
  }

  async function confirmRemove() {
    if (!client || !removeTarget || busy) {
      return;
    }
    setBusy(true);
    const result = await archiveProduct(client, removeTarget.id);
    setBusy(false);
    if (!result.ok) {
      if (!(await redirect(result))) {
        setNotice(result.message);
      }
      setRemoveTarget(null);
      return;
    }
    setNotice(`${removeTarget.name} was removed from the customer app. You can restore it later.`);
    setRemoveTarget(null);
    setAttempt((value) => value + 1);
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
        <p className="text-sm text-secondary">{error}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
          <Link href="/categories" className="rounded-xl border border-line px-4 py-2 text-sm font-medium">
            All categories
          </Link>
        </div>
      </section>
    );
  }

  if (!category || !products) {
    return <div className="h-40 animate-pulse rounded-2xl border border-line bg-white" aria-busy="true" />;
  }

  const categoryImage = resolveProductImage(category.imageDeliveryPath, imageBase);

  return (
    <div className="space-y-6">
      <Link href="/categories" className="text-sm font-medium text-secondary underline">
        ← All categories
      </Link>
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-card sm:flex-row sm:items-center">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-wash">
          {categoryImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={categoryImage} alt={category.name} className="size-full object-cover" />
          ) : (
            <span className="font-display text-2xl font-extrabold text-muted">{category.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words font-display text-xl font-extrabold">{category.name}</h2>
            <StatusBadge value={category.isActive ? "active" : "inactive"} />
          </div>
          <p className="mt-1 text-sm text-muted">{formatCount(category.productCount)} {category.productCount === 1 ? "product" : "products"}</p>
          {category.description ? <p className="mt-1 text-sm text-secondary">{category.description}</p> : null}
        </div>
        <div className="flex gap-2">
          <button type="button" className="h-11 rounded-xl border border-line px-4 text-sm font-medium" onClick={() => setEditing(true)}>
            Edit Category
          </button>
          <Link href={`/products/new?category=${category.id}`} className="inline-flex h-11 items-center rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink">
            Add Product
          </Link>
        </div>
      </section>
      {!category.isActive ? (
        <p className="rounded-xl border border-line bg-wash px-4 py-3 text-sm">This category is inactive, so customers cannot see it or its products.</p>
      ) : null}
      {notice ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm" role="status">{notice}</p> : null}
      <div>
        <label className="sr-only" htmlFor="category-product-search">
          Search products in {category.name}
        </label>
        <input
          id="category-product-search"
          value={search}
          placeholder={`Search in ${category.name}`}
          className={controlClassName}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>
      {products.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <h2 className="font-display text-lg font-extrabold">{search.trim() ? "No products match" : "No products yet"}</h2>
          {search.trim() ? null : <p className="mt-2 text-sm text-secondary">Add the first product to {category.name}.</p>}
        </section>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => {
            const imageUrl = resolveProductImage(product.primaryImagePath, imageBase);
            const live = product.publicationStatus === "published" && product.isActive;
            return (
              <li key={product.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-wash">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={product.name} className="size-full object-cover" />
                    ) : (
                      <span className="text-xs text-muted">No image</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link href={`/products/${product.id}`} className="break-words font-medium hover:underline">
                      {product.name}
                    </Link>
                    <p className="text-sm text-muted">
                      {formatPaise(product.inventory.pricePaise)} · {formatCount(product.inventory.stockQuantity)} in stock
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <StatusBadge value={product.publicationStatus} />
                      {product.publicationStatus !== "archived" && !product.isActive ? <StatusBadge value="inactive" /> : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {live ? null : (
                    <button type="button" disabled={busy} className="h-9 rounded-xl bg-ink px-3 text-sm font-medium text-white disabled:opacity-60" onClick={() => void makeLive(product)}>
                      Publish
                    </button>
                  )}
                  <Link href={`/products/${product.id}/edit`} className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-sm font-medium">
                    Edit
                  </Link>
                  {product.publicationStatus === "archived" ? null : (
                    <button type="button" className="h-9 rounded-xl border border-line px-3 text-sm" onClick={() => setRemoveTarget(product)}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pageCount > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Product pages">
          <button type="button" disabled={page <= 1} className="h-10 rounded-xl border border-line px-4 disabled:opacity-40" onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className="text-muted">
            Page {page} of {pageCount} · {formatCount(total)} products
          </span>
          <button type="button" disabled={page >= pageCount} className="h-10 rounded-xl border border-line px-4 disabled:opacity-40" onClick={() => setPage(page + 1)}>
            Next
          </button>
        </nav>
      ) : null}
      {editing ? (
        <CategoryEditor
          category={category}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setNotice(message);
            setEditing(false);
            setAttempt((value) => value + 1);
          }}
        />
      ) : null}
      {removeTarget ? (
        <ConfirmDialog
          title={`Remove ${removeTarget.name}?`}
          body="Customers will no longer see this product. Its stock and order history are kept, and you can publish it again."
          confirmLabel="Remove product"
          pending={busy}
          onCancel={() => {
            if (!busy) {
              setRemoveTarget(null);
            }
          }}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}
    </div>
  );
}
