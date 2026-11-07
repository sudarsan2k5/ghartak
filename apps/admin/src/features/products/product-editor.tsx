"use client";

import { productUnitValues } from "@ghartak/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { controlClassName, describedBy, Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImagePicker } from "@/components/ui/image-picker";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import {
  emptyProductDraft,
  restoreDraftPayload,
  validateCreate,
  validateUpdate,
  type LoadedProduct,
  type ProductDraft,
} from "@/lib/products/form";
import { assignableCategories, categoryOptionLabel } from "@/lib/categories/form";
import { createProduct, fetchCategories, fetchProduct, updateProduct, uploadProductImage } from "@/lib/products/requests";
import { paiseToRupeeInput } from "@/lib/products/money";

const unitLabels: Record<(typeof productUnitValues)[number], string> = {
  piece: "Piece",
  kg: "Kilogram",
  g: "Gram",
  litre: "Litre",
  ml: "Millilitre",
};

export function ProductEditor({ mode, productId, fixedCategoryId }: { mode: "create" | "edit"; productId?: string; fixedCategoryId?: string }) {
  const router = useRouter();
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [draft, setDraft] = useState<ProductDraft>(() =>
    fixedCategoryId
      ? { ...emptyProductDraft(), categoryId: fixedCategoryId, publicationStatus: "published", openingReason: "Opening stock" }
      : emptyProductDraft(),
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<LoadedProduct | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(mode === "edit" || Boolean(fixedCategoryId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const categoryResult = await fetchCategories(client);
      if (cancelled) {
        return;
      }
      if (!categoryResult.ok) {
        if (await redirect(categoryResult)) {
          return;
        }
        setLoadError("Categories could not be loaded.");
        setLoading(false);
        return;
      }
      if (mode === "create" || !productId) {
        if (fixedCategoryId && !categoryResult.data.categories.some((category) => category.id === fixedCategoryId)) {
          setLoadError("This category no longer exists.");
          setLoading(false);
          return;
        }
        setCategories(assignableCategories(categoryResult.data.categories, fixedCategoryId));
        setLoading(false);
        return;
      }
      const productResult = await fetchProduct(client, productId);
      if (cancelled) {
        return;
      }
      if (!productResult.ok) {
        if (await redirect(productResult)) {
          return;
        }
        setLoadError(productResult.status === 404 ? "This product is not available." : "The product could not be loaded.");
        setLoading(false);
        return;
      }
      const product = productResult.data;
      setCategories(assignableCategories(categoryResult.data.categories, product.category.id));
      const loaded: LoadedProduct = {
        name: product.name,
        sku: product.sku,
        categoryId: product.category.id,
        unit: product.unit,
        packageSize: String(product.packageSize),
        packageLabel: product.packageLabel,
        brand: product.brand ?? "",
        barcode: product.barcode ?? "",
        description: product.description ?? "",
        attributes: product.attributes.map((attribute) => ({ name: attribute.name, value: attribute.value })),
        publicationStatus: product.publicationStatus,
        isActive: product.isActive,
      };
      setOriginal(loaded);
      setDraft({
        ...emptyProductDraft(),
        ...loaded,
        priceRupees: paiseToRupeeInput(product.inventory.pricePaise),
        openingStock: String(product.inventory.stockQuantity),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, fixedCategoryId, mode, productId, redirect]);

  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || pending) {
      return;
    }
    setFormError(null);
    setSaved(false);
    if (mode === "create") {
      const parsed = validateCreate(draft);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      setErrors({});
      setPending(true);
      const result = await createProduct(client, parsed.payload);
      if (!result.ok) {
        setPending(false);
        if (await redirect(result)) {
          return;
        }
        setFormError(result.message);
        return;
      }
      if (imageFile) {
        const uploaded = await uploadProductImage(client, result.data.id, {
          file: imageFile,
          altText: result.data.name,
          isPrimary: true,
          idempotencyKey: crypto.randomUUID(),
        });
        if (!uploaded.ok) {
          // The product exists, so open it where the image can be retried.
          router.replace(`/products/${result.data.id}`);
          return;
        }
      }
      router.replace(fixedCategoryId ? `/categories/${fixedCategoryId}` : `/products/${result.data.id}`);
      return;
    }
    if (!original || !productId) {
      return;
    }
    const parsed = validateUpdate(original, draft);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    if (!parsed.payload) {
      setFormError("No changes to save.");
      return;
    }
    setPending(true);
    const result = await updateProduct(client, productId, parsed.payload);
    setPending(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setFormError(result.message);
      return;
    }
    const product = result.data;
    const loaded = loadedFromProduct(product);
    setOriginal(loaded);
    setDraft((current) => ({ ...current, ...loaded }));
    setSaved(true);
  }

  async function restore() {
    if (!client || !productId || pending) {
      return;
    }
    setPending(true);
    const result = await updateProduct(client, productId, restoreDraftPayload());
    setPending(false);
    setRestoreOpen(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setFormError(result.message);
      return;
    }
    const loaded = loadedFromProduct(result.data);
    setOriginal(loaded);
    setDraft((current) => ({ ...current, ...loaded }));
    setSaved(true);
  }

  if (loading) {
    return <p className="text-sm text-secondary" aria-live="polite">Loading the product form</p>;
  }
  if (loadError) {
    return (
      <section className="max-w-xl rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
        <h2 className="font-display text-lg font-extrabold">Form unavailable</h2>
        <p className="mt-3 text-sm text-secondary">{loadError}</p>
      </section>
    );
  }

  const stock = Number(draft.openingStock);
  const showReason = mode === "create" && Number.isInteger(stock) && stock > 0;
  const archived = original?.publicationStatus === "archived";

  return (
    <form className="max-w-3xl space-y-6" onSubmit={(event) => void onSubmit(event)} noValidate>
      {fixedCategoryId || original ? (
        <Link href={`/categories/${fixedCategoryId ?? original?.categoryId}`} className="text-sm font-medium text-secondary underline">
          ← {categories.find((category) => category.id === (fixedCategoryId ?? original?.categoryId))?.name ?? "Category"}
        </Link>
      ) : null}
      {formError ? (
        <p className="rounded-xl border border-line bg-wash px-4 py-3 text-sm" role="alert">
          {formError}
        </p>
      ) : null}
      {mode === "create" ? (
        <p className="text-sm text-secondary">Price and opening stock create the one central listing.</p>
      ) : (
        <p className="text-sm text-secondary">This form updates catalogue fields only. Price is saved separately and does not travel with this request.</p>
      )}
      <div className="grid gap-5 rounded-2xl border border-line bg-white p-5 shadow-card md:grid-cols-2">
        <Field id="name" label="Product name" error={errors["name"]}>
          <input id="name" value={draft.name} aria-invalid={errors["name"] !== undefined} aria-describedby={describedBy("name", errors["name"])} className={controlClassName} onChange={(event) => update("name", event.target.value)} />
        </Field>
        <Field id="sku" label="SKU" error={errors["sku"]} hint="Uppercase letters, numbers, and hyphens.">
          <input id="sku" value={draft.sku} aria-invalid={errors["sku"] !== undefined} aria-describedby={describedBy("sku", errors["sku"], "Uppercase letters, numbers, and hyphens.")} className={controlClassName} onChange={(event) => update("sku", event.target.value)} />
        </Field>
        {fixedCategoryId ? (
          <div>
            <p className="text-sm font-medium">Category</p>
            <p className="mt-2 flex h-12 items-center rounded-xl border border-line bg-wash px-3 text-sm">
              {categories.find((category) => category.id === fixedCategoryId)?.name}
            </p>
          </div>
        ) : (
        <Field id="category" label="Category" error={errors["categoryId"]}>
          <select id="category" value={draft.categoryId} aria-invalid={errors["categoryId"] !== undefined} aria-describedby={describedBy("category", errors["categoryId"])} className={controlClassName} onChange={(event) => update("categoryId", event.target.value)}>
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryOptionLabel(category)}
              </option>
            ))}
          </select>
        </Field>
        )}
        <Field id="unit" label="Unit" error={errors["unit"]}>
          <select id="unit" value={draft.unit} aria-invalid={errors["unit"] !== undefined} aria-describedby={describedBy("unit", errors["unit"])} className={controlClassName} onChange={(event) => update("unit", event.target.value)}>
            <option value="">Choose a unit</option>
            {productUnitValues.map((unit) => (
              <option key={unit} value={unit}>
                {unitLabels[unit]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="package-size" label="Pack size" error={errors["packageSize"]}>
          <input id="package-size" inputMode="decimal" value={draft.packageSize} aria-invalid={errors["packageSize"] !== undefined} aria-describedby={describedBy("package-size", errors["packageSize"])} className={controlClassName} onChange={(event) => update("packageSize", event.target.value)} />
        </Field>
        <Field id="package-label" label="Package label" error={errors["packageLabel"]} hint="Shown to customers, for example 1 kg.">
          <input id="package-label" value={draft.packageLabel} aria-invalid={errors["packageLabel"] !== undefined} aria-describedby={describedBy("package-label", errors["packageLabel"], "Shown to customers, for example 1 kg.")} className={controlClassName} onChange={(event) => update("packageLabel", event.target.value)} />
        </Field>
        {mode === "create" ? (
          <>
            <Field id="price" label="Price in rupees" error={errors["priceRupees"]} hint="Stored as integer paise.">
              <input id="price" inputMode="decimal" value={draft.priceRupees} aria-invalid={errors["priceRupees"] !== undefined} aria-describedby={describedBy("price", errors["priceRupees"], "Stored as integer paise.")} className={controlClassName} onChange={(event) => update("priceRupees", event.target.value)} />
            </Field>
            <Field id="mrp" label="MRP in rupees" error={errors["mrpRupees"]} hint="Optional. Customers see a discount when MRP is above the price.">
              <input id="mrp" inputMode="decimal" value={draft.mrpRupees} aria-invalid={errors["mrpRupees"] !== undefined} aria-describedby={describedBy("mrp", errors["mrpRupees"], "Optional. Customers see a discount when MRP is above the price.")} className={controlClassName} onChange={(event) => update("mrpRupees", event.target.value)} />
            </Field>
            <Field id="opening-stock" label="Opening stock" error={errors["openingStock"]}>
              <input id="opening-stock" inputMode="numeric" value={draft.openingStock} aria-invalid={errors["openingStock"] !== undefined} aria-describedby={describedBy("opening-stock", errors["openingStock"])} className={controlClassName} onChange={(event) => update("openingStock", event.target.value)} />
            </Field>
            {showReason ? (
              <Field id="opening-reason" label="Opening stock reason" error={errors["openingReason"]}>
                <input id="opening-reason" value={draft.openingReason} aria-invalid={errors["openingReason"] !== undefined} aria-describedby={describedBy("opening-reason", errors["openingReason"])} className={controlClassName} onChange={(event) => update("openingReason", event.target.value)} />
              </Field>
            ) : null}
          </>
        ) : null}
        <Field id="brand" label="Brand" error={errors["brand"]} hint="Optional.">
          <input id="brand" value={draft.brand} aria-invalid={errors["brand"] !== undefined} aria-describedby={describedBy("brand", errors["brand"], "Optional.")} className={controlClassName} onChange={(event) => update("brand", event.target.value)} />
        </Field>
        <Field id="barcode" label="Barcode" error={errors["barcode"]} hint="Optional. 8 to 14 digits.">
          <input id="barcode" inputMode="numeric" value={draft.barcode} aria-invalid={errors["barcode"] !== undefined} aria-describedby={describedBy("barcode", errors["barcode"], "Optional. 8 to 14 digits.")} className={controlClassName} onChange={(event) => update("barcode", event.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field id="description" label="Description" error={errors["description"]} hint="Optional.">
            <textarea id="description" rows={4} value={draft.description} aria-invalid={errors["description"] !== undefined} aria-describedby={describedBy("description", errors["description"], "Optional.")} className={controlClassName} onChange={(event) => update("description", event.target.value)} />
          </Field>
        </div>
        {mode === "create" ? (
          <>
            <div className="md:col-span-2">
              <ImagePicker label="Product image" savedUrl={null} file={imageFile} disabled={pending} onFile={setImageFile} onRemoveSaved={() => setImageFile(null)} />
            </div>
            <label className="flex items-start gap-3 text-sm md:col-span-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={draft.publicationStatus === "published"}
                onChange={(event) => update("publicationStatus", event.target.checked ? "published" : "draft")}
              />
              <span>
                <span className="font-medium">Show in the customer app now</span>
                <span className="mt-1 block text-muted">Leave this off to save the product as a draft.</span>
              </span>
            </label>
          </>
        ) : null}
        {mode === "edit" && original ? (
          <>
            <Field id="publication" label="Publication" hint={archived ? "Archived products stay archived until you restore them to draft." : "Saving publishes or returns the product to draft."}>
              <select
                id="publication"
                className={controlClassName}
                value={archived ? "archived" : draft.publicationStatus}
                disabled={archived}
                onChange={(event) => update("publicationStatus", event.target.value as ProductDraft["publicationStatus"])}
              >
                {archived ? <option value="archived">Archived</option> : null}
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
            <Field id="active" label="Active" hint="Inactive products stay out of the customer catalogue.">
              <label className="flex items-center gap-3 text-sm">
                <input id="active" type="checkbox" checked={draft.isActive} onChange={(event) => update("isActive", event.target.checked)} />
                Product is active
              </label>
            </Field>
          </>
        ) : null}
      </div>
      <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Attributes</h2>
          <button
            type="button"
            className="rounded-xl border border-line px-3 py-2 text-sm font-medium"
            onClick={() => update("attributes", [...draft.attributes, { name: "", value: "" }])}
          >
            Add attribute
          </button>
        </div>
        {draft.attributes.length === 0 ? <p className="mt-3 text-sm text-muted">No attributes yet.</p> : null}
        <ul className="mt-4 space-y-3">
          {draft.attributes.map((attribute, index) => (
            <li key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input aria-label={`Attribute ${index + 1} name`} value={attribute.name} className={controlClassName} onChange={(event) => update("attributes", draft.attributes.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
              <input aria-label={`Attribute ${index + 1} value`} value={attribute.value} className={controlClassName} onChange={(event) => update("attributes", draft.attributes.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} />
              <button type="button" className="rounded-xl px-3 py-2 text-sm text-secondary" onClick={() => update("attributes", draft.attributes.filter((_, rowIndex) => rowIndex !== index))}>
                Remove
              </button>
              {errors[`attributes.${index}`] ? <p className="text-sm text-secondary md:col-span-3">{errors[`attributes.${index}`]}</p> : null}
            </li>
          ))}
        </ul>
        {errors["attributes"] ? <p className="mt-3 text-sm text-secondary">{errors["attributes"]}</p> : null}
      </section>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={pending || client === null} className="rounded-xl bg-lime px-4 py-3 font-display text-sm font-semibold text-ink disabled:opacity-60">
          {pending ? "Saving" : mode === "create" && draft.publicationStatus !== "published" ? "Create draft" : "Save product"}
        </button>
        {archived ? (
          <button type="button" className="rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium" onClick={() => setRestoreOpen(true)}>
            Restore to draft
          </button>
        ) : null}
      </div>
      {saved ? <p className="text-sm text-savings">Product saved.</p> : null}
      {restoreOpen ? (
        <ConfirmDialog
          title="Restore this product to draft?"
          body="The product stays inactive until you turn Active on and save. This does not publish it."
          confirmLabel="Restore to draft"
          pending={pending}
          onCancel={() => setRestoreOpen(false)}
          onConfirm={() => void restore()}
        />
      ) : null}
    </form>
  );
}

function loadedFromProduct(product: {
  name: string;
  sku: string;
  category: { id: string };
  unit: string;
  packageSize: number;
  packageLabel: string;
  brand: string | null;
  barcode: string | null;
  description: string | null;
  attributes: Array<{ name: string; value: string }>;
  publicationStatus: LoadedProduct["publicationStatus"];
  isActive: boolean;
}): LoadedProduct {
  return {
    name: product.name,
    sku: product.sku,
    categoryId: product.category.id,
    unit: product.unit,
    packageSize: String(product.packageSize),
    packageLabel: product.packageLabel,
    brand: product.brand ?? "",
    barcode: product.barcode ?? "",
    description: product.description ?? "",
    attributes: product.attributes.map((attribute) => ({ name: attribute.name, value: attribute.value })),
    publicationStatus: product.publicationStatus,
    isActive: product.isActive,
  };
}
