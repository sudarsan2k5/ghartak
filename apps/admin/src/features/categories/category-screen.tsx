"use client";

import { adminCategorySchema } from "@ghartak/contracts";
import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { z } from "zod";
import { ImagePicker } from "@/components/ui/image-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlClassName, describedBy, Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import {
  categoryListView,
  deleteIntent,
  emptyCategoryDraft,
  filterCategories,
  validateCreate,
  validateUpdate,
  type CategoryDraft,
} from "@/lib/categories/form";
import { createCategory, deleteCategory, removeCategoryImage, reorderCategories, updateCategory, uploadCategoryImage } from "@/lib/categories/requests";
import { readImageBaseUrl, resolveProductImage } from "@/lib/products/images";
import { fetchCategories } from "@/lib/products/requests";
import { formatCount } from "@/lib/utils/format";

type Category = z.infer<typeof adminCategorySchema>;

export type { Category };

export function CategoryScreen() {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState(categoryListView({ phase: "loading" }));
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [editor, setEditor] = useState<Category | "new" | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Category | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const imageBase = readImageBaseUrl();

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    void fetchCategories(client).then(async (result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        if (await redirect(result)) {
          return;
        }
        setView(categoryListView({ phase: "error", message: "Categories could not be loaded." }));
        return;
      }
      setCategories(result.data.categories);
      setView(categoryListView({ phase: "ready", count: result.data.categories.length }));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, redirect]);

  const visible = filterCategories(categories, query, status);
  const shown = view.kind === "ready" ? categoryListView({ phase: "ready", count: visible.length }) : view;

  function refresh() {
    setView(categoryListView({ phase: "loading" }));
    setAttempt((current) => current + 1);
  }

  async function move(category: Category, offset: -1 | 1) {
    if (!client || reordering) {
      return;
    }
    const index = categories.findIndex((row) => row.id === category.id);
    const target = categories[index + offset];
    if (!target) {
      return;
    }
    const next = [...categories];
    next[index] = target;
    next[index + offset] = category;
    setReordering(true);
    setCategories(next);
    const result = await reorderCategories(client, next.map((row) => row.id));
    setReordering(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setNotice(result.message);
      refresh();
    }
  }

  async function confirmDelete() {
    if (!client || !removeTarget || pendingDelete) {
      return;
    }
    const intent = deleteIntent(removeTarget);
    if (intent === "offer-deactivate") {
      setPendingDelete(true);
      const result = await updateCategory(client, removeTarget.id, { isActive: false });
      setPendingDelete(false);
      if (!result.ok) {
        if (await redirect(result)) {
          return;
        }
        setNotice(result.message);
        return;
      }
      setNotice(`${removeTarget.name} is inactive. Its products stay in this category.`);
      setRemoveTarget(null);
      refresh();
      return;
    }
    if (intent !== "confirm-delete") {
      setRemoveTarget(null);
      return;
    }
    setPendingDelete(true);
    const result = await deleteCategory(client, removeTarget.id);
    setPendingDelete(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setNotice(
        result.kind === "conflict"
          ? "This category still has products, so it was not deleted. Deactivate it if new products should stop using it."
          : result.message,
      );
      setRemoveTarget(null);
      refresh();
      return;
    }
    setNotice(`${removeTarget.name} was deleted.`);
    setRemoveTarget(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <p className="max-w-2xl text-sm leading-6 text-secondary">
          Every category customers can browse. Open a category to manage its products. The order here is the order customers see.
        </p>
        <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink" onClick={() => setEditor("new")}>
          Add Category
        </button>
      </div>
      <form
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:grid-cols-[minmax(0,1fr)_180px_auto]"
        onSubmit={(event) => event.preventDefault()}
      >
        <div>
          <label className="text-sm font-medium" htmlFor="category-search">
            Search
          </label>
          <input id="category-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Category name" className={`${controlClassName} mt-2`} />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="category-status">
            Status
          </label>
          <select id="category-status" className={`${controlClassName} mt-2`} value={status} onChange={(event) => setStatus(event.target.value as "" | "active" | "inactive")}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" className="h-12 w-full rounded-xl border border-line px-4 text-sm font-medium sm:w-auto" onClick={() => { setQuery(""); setStatus(""); }}>
            Clear
          </button>
        </div>
      </form>
      {notice ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm">{notice}</p> : null}
      {shown.kind === "loading" ? (
        <div className="space-y-3" aria-busy="true">
          <p className="sr-only">Loading categories</p>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl border border-line bg-white" />
          ))}
        </div>
      ) : null}
      {shown.kind === "error" ? (
        <section className="rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
          <h2 className="font-display text-lg font-extrabold">Categories unavailable</h2>
          <p className="mt-3 text-sm text-secondary">{shown.message}</p>
          <button type="button" className="mt-5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white" onClick={refresh}>
            Try again
          </button>
        </section>
      ) : null}
      {shown.kind === "empty" ? (
        <section className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <h2 className="font-display text-lg font-extrabold">{categories.length === 0 ? "No categories yet" : "No categories match"}</h2>
          <p className="mt-2 text-sm text-secondary">{categories.length === 0 ? "Add a category for the central catalogue." : "Try another name or status."}</p>
        </section>
      ) : null}
      {shown.kind === "ready" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((category) => {
            const imageUrl = resolveProductImage(category.imageDeliveryPath, imageBase);
            const canMove = !query.trim() && !status;
            const position = categories.findIndex((row) => row.id === category.id);
            return (
              <li key={category.id} className="flex gap-4 rounded-2xl border border-line bg-white p-4 shadow-card">
                <Link href={`/categories/${category.id}`} aria-label={`Manage ${category.name}`} className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-wash">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={category.name} className="size-full object-cover" />
                  ) : (
                    <span className="font-display text-2xl font-extrabold text-muted">{category.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/categories/${category.id}`} className="break-words font-medium hover:underline">{category.name}</Link>
                    <StatusBadge value={category.isActive ? "active" : "inactive"} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{formatCount(category.productCount)} {category.productCount === 1 ? "product" : "products"}</p>
                  {canMove ? (
                    <div className="mt-2 flex gap-1">
                      <button type="button" aria-label={`Move ${category.name} earlier`} disabled={reordering || position === 0} className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-40" onClick={() => void move(category, -1)}>
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" aria-label={`Move ${category.name} later`} disabled={reordering || position === categories.length - 1} className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-40" onClick={() => void move(category, 1)}>
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-auto flex gap-2 pt-3">
                    <button type="button" className="h-9 flex-1 rounded-xl bg-lime font-display text-sm font-semibold text-ink" onClick={() => setEditor(category)}>
                      Edit
                    </button>
                    <button type="button" className="h-9 flex-1 rounded-xl border border-line text-sm" onClick={() => setRemoveTarget(category)}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {editor ? (
        <CategoryEditor
          category={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setNotice(message);
            setEditor(null);
            refresh();
          }}
        />
      ) : null}
      {removeTarget ? (
        <ConfirmDialog
          title={deleteTitle(removeTarget)}
          body={deleteBody(removeTarget)}
          confirmLabel={deleteLabel(removeTarget)}
          pending={pendingDelete}
          onCancel={() => {
            if (!pendingDelete) {
              setRemoveTarget(null);
            }
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}

export function CategoryEditor({
  category,
  onClose,
  onSaved,
}: {
  category: Category | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const titleId = useId();
  const [draft, setDraft] = useState<CategoryDraft>(
    category
      ? { name: category.name, slug: category.slug, description: category.description ?? "", isActive: category.isActive }
      : emptyCategoryDraft(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const savedImage = removeImage ? null : resolveProductImage(category?.imageDeliveryPath, readImageBaseUrl());

  /** Runs after the category row is saved. A failure keeps the text changes and reports the image problem. */
  async function saveImage(categoryId: string, name: string, verb: string) {
    if (!client) {
      return;
    }
    let message = `${name} was ${verb}.`;
    if (imageFile) {
      const uploaded = await uploadCategoryImage(client, categoryId, imageFile);
      if (!uploaded.ok) {
        message = `${name} was ${verb}, but its image could not be uploaded: ${uploaded.message}`;
      }
    } else if (removeImage) {
      const removed = await removeCategoryImage(client, categoryId);
      if (!removed.ok) {
        message = `${name} was ${verb}, but its image could not be removed: ${removed.message}`;
      }
    }
    onSaved(message);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client || pending) {
      return;
    }
    if (!category) {
      const created = validateCreate(draft);
      if (!created.ok) {
        setErrors(created.errors);
        return;
      }
      setPending(true);
      setErrors({});
      const result = await createCategory(client, created.payload);
      if (!result.ok) {
        setPending(false);
        if (await redirect(result)) {
          return;
        }
        setFormError(result.message);
        return;
      }
      await saveImage(result.data.id, result.data.name, "added");
      return;
    }
    const updated = validateUpdate(
      { name: category.name, slug: category.slug, description: category.description, isActive: category.isActive },
      draft,
    );
    if (!updated.ok) {
      setErrors(updated.errors);
      return;
    }
    if (!updated.payload && !imageFile && !removeImage) {
      setFormError("No changes to save.");
      return;
    }
    setPending(true);
    setErrors({});
    if (updated.payload) {
      const result = await updateCategory(client, category.id, updated.payload);
      if (!result.ok) {
        setPending(false);
        if (await redirect(result)) {
          return;
        }
        setFormError(result.message);
        return;
      }
    }
    await saveImage(category.id, draft.name.trim(), "saved");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/30 px-4 py-4 sm:place-items-center" role="presentation">
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-card" onSubmit={(event) => void submit(event)}>
        <h2 id={titleId} className="font-display text-xl font-extrabold">
          {category ? "Edit category" : "Add category"}
        </h2>
        <div className="mt-4 space-y-4">
          <Field id="category-name" label="Name" error={errors["name"]}>
            <input id="category-name" value={draft.name} aria-invalid={Boolean(errors["name"])} aria-describedby={describedBy("category-name", errors["name"])} className={controlClassName} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <ImagePicker
            label="Front image"
            savedUrl={savedImage}
            file={imageFile}
            disabled={pending}
            onFile={(file) => {
              setImageFile(file);
              setRemoveImage(false);
            }}
            onRemoveSaved={() => setRemoveImage(true)}
          />
          {category ? (
            <>
            <Field id="category-description" label="Description" error={errors["description"]} hint="Optional.">
              <textarea id="category-description" value={draft.description} rows={3} aria-invalid={Boolean(errors["description"])} aria-describedby={describedBy("category-description", errors["description"], "Optional.")} className={controlClassName} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
              <span>
                <span className="font-medium">Active</span>
                <span className="mt-1 block text-muted">Inactive categories and their products are hidden from customers.</span>
              </span>
            </label>
            <details className="text-sm" open={Boolean(errors["slug"])}>
              <summary className="cursor-pointer font-medium">Advanced</summary>
              <div className="mt-3">
              <Field id="category-slug" label="Slug" error={errors["slug"]} hint={category ? "Lowercase letters, numbers, and hyphens." : "Optional. Leave blank and the server will make one from the name."}>
                <input id="category-slug" value={draft.slug} aria-invalid={Boolean(errors["slug"])} aria-describedby={describedBy("category-slug", errors["slug"], "Optional. Leave blank and the server will make one from the name.")} className={controlClassName} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
              </Field>
              </div>
            </details>
            </>
          ) : null}
          {formError ? (
            <p className="rounded-xl border border-line bg-wash px-4 py-3 text-sm" role="alert">
              {formError}
            </p>
          ) : null}
          {errors["form"] ? <p className="text-sm text-secondary">{errors["form"]}</p> : null}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="h-11 rounded-xl border border-line px-4 text-sm font-medium" disabled={pending} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="h-11 rounded-xl bg-ink px-4 text-sm font-medium text-white disabled:opacity-60" disabled={pending}>
            {pending ? "Saving" : "Save Category"}
          </button>
        </div>
      </form>
    </div>
  );
}

function deleteTitle(category: Category): string {
  const intent = deleteIntent(category);
  if (intent === "confirm-delete") {
    return `Delete ${category.name}?`;
  }
  return `${category.name} cannot be deleted`;
}

function deleteBody(category: Category): string {
  const intent = deleteIntent(category);
  if (intent === "confirm-delete") {
    return "This category has no products. Deleting it does not change any product.";
  }
  if (intent === "offer-deactivate") {
    return `${category.name} is used by ${formatCount(category.productCount)} products, so it cannot be deleted. Deactivate it instead. Products stay in this category and are not moved or deleted.`;
  }
  return `${category.name} is already inactive and still has ${formatCount(category.productCount)} products. Those products stay in this category.`;
}

function deleteLabel(category: Category): string {
  const intent = deleteIntent(category);
  if (intent === "confirm-delete") {
    return "Delete category";
  }
  if (intent === "offer-deactivate") {
    return "Deactivate";
  }
  return "Close";
}
