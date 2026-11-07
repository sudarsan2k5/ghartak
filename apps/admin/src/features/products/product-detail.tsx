"use client";

import { adminProductSchema } from "@ghartak/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { readImageBaseUrl } from "@/lib/products/images";
import { archiveProduct, fetchProduct } from "@/lib/products/requests";
import { formatCount, formatPaise } from "@/lib/utils/format";
import { StockAdjustment } from "@/features/inventory/stock-adjustment";
import { inventoryQuerySupport } from "@/lib/inventory/stock";
import { ImageManager } from "./image-manager";
import { PriceEditor } from "./price-editor";

type Product = z.infer<typeof adminProductSchema>;

export function ProductDetail({ productId }: { productId: string }) {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const imageBase = readImageBaseUrl();
  const failedImages = Number(useSearchParams().get("imagesFailed") ?? 0);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    void fetchProduct(client, productId).then(async (result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        if (await redirect(result)) {
          return;
        }
        setError(result.status === 404 ? "This product is not available." : "The product could not be loaded.");
        setLoading(false);
        return;
      }
      setProduct(result.data);
      setError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, productId, redirect]);

  async function confirmArchive() {
    if (!client || archiving) {
      return;
    }
    setArchiving(true);
    const result = await archiveProduct(client, productId);
    setArchiving(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setError(result.message);
      setArchiveOpen(false);
      return;
    }
    setProduct(result.data);
    setArchiveOpen(false);
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="sr-only">Loading product</p>
        <div className="h-28 animate-pulse rounded-2xl border border-line bg-white" />
        <div className="h-40 animate-pulse rounded-2xl border border-line bg-white" />
      </div>
    );
  }
  if (!product) {
    return (
      <section className="max-w-xl rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
        <h2 className="font-display text-lg font-extrabold">Product unavailable</h2>
        <p className="mt-3 text-sm text-secondary">{error ?? "The product could not be loaded."}</p>
        <button
          type="button"
          className="mt-5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white"
          onClick={() => {
            setLoading(true);
            setAttempt((current) => current + 1);
          }}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {failedImages > 0 ? (
        <p className="rounded-xl border border-danger bg-wash px-4 py-3 text-sm font-medium text-danger" role="alert">
          The product was saved, but {failedImages === 1 ? "1 image" : `${failedImages} images`} could not be uploaded. Add {failedImages === 1 ? "it" : "them"} again below.
        </p>
      ) : null}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link href={`/categories/${product.category.id}`} className="text-sm font-medium text-secondary underline">
            ← {product.category.name}
          </Link>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge value={product.publicationStatus} />
            <StatusBadge value={product.inventory.availability} />
            <span className="inline-flex rounded-full bg-page px-2.5 py-1 text-xs font-medium text-secondary">
              {product.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/products/${product.id}/edit`} className="inline-flex h-11 items-center rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink">
            Edit product
          </Link>
          {product.publicationStatus === "archived" ? null : (
            <button type="button" className="h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium" onClick={() => setArchiveOpen(true)}>
              Archive
            </button>
          )}
        </div>
      </div>
      {error ? (
        <p className="rounded-xl border border-line bg-wash px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <section className="grid gap-4 rounded-2xl border border-line bg-white p-5 shadow-card md:grid-cols-2">
        <Detail label="Category" value={product.category.name} />
        <Detail label="Brand" value={product.brand ?? "—"} />
        <Detail label="Unit" value={product.unit} />
        <Detail label="Pack" value={`${product.packageSize} · ${product.packageLabel}`} />
        <Detail label="Price" value={formatPaise(product.inventory.pricePaise)} />
        <div className="md:col-span-2">
          <h2 className="text-sm font-medium text-muted">Description</h2>
          <p className="mt-2 text-sm leading-6 text-secondary">{product.description ?? "No description."}</p>
        </div>
      </section>
      <ImageManager
        productId={product.id}
        productName={product.name}
        images={product.images}
        imageBase={imageBase}
        onChange={(images) => setProduct({ ...product, images })}
        onError={(message) => setError(message.length > 0 ? message : null)}
      />
      <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="font-display text-lg font-extrabold">Inventory</h2>
            <p className="mt-3 text-sm">
              {formatCount(product.inventory.stockQuantity)} in stock
            </p>
            <div className="mt-3">
              <StatusBadge value={product.inventory.availability} />
            </div>
          </div>
          <button type="button" className="h-11 rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink" onClick={() => setStockOpen(true)}>
            Adjust stock
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-secondary">
          {inventoryQuerySupport.movementHistory
            ? "Movement history is listed below."
            : "Movement history is not available from the admin API. An adjustment writes a ledger row on the server and then this page shows the resulting stock."}
        </p>
      </section>
      <PriceEditor productId={product.id} pricePaise={product.inventory.pricePaise} mrpPaise={product.inventory.mrpPaise} onSaved={(pricePaise, mrpPaise) => setProduct({ ...product, inventory: { ...product.inventory, pricePaise, mrpPaise } })} />
      {stockOpen ? (
        <StockAdjustment
          product={{
            id: product.id,
            name: product.name,
            stockQuantity: product.inventory.stockQuantity,
            packageLabel: product.packageLabel,
          }}
          onClose={() => setStockOpen(false)}
          onApplied={(inventory) => {
            setProduct((current) => (current ? { ...current, inventory: { ...current.inventory, ...inventory } } : current));
            setAttempt((current) => current + 1);
          }}
          onRefresh={() => setAttempt((current) => current + 1)}
        />
      ) : null}
      {archiveOpen ? (
        <ConfirmDialog
          title={`Archive ${product.name}?`}
          body="Archiving hides the product from customers. The price, stock, and order history stay in place. This does not delete the product."
          confirmLabel="Archive product"
          pending={archiving}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => void confirmArchive()}
        />
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-muted">{label}</h2>
      <p className="mt-2 text-sm">{value}</p>
    </div>
  );
}
