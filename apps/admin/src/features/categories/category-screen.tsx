"use client";

import { adminCategorySchema } from "@ghartak/contracts";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { z } from "zod";
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
import { createCategory, deleteCategory, updateCategory } from "@/lib/categories/requests";
import { fetchCategories } from "@/lib/products/requests";
import { formatCount } from "@/lib/utils/format";

type Category = z.infer<typeof adminCategorySchema>;

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
          Categories are shared by the central catalogue. The list includes inactive categories. A category with products can be deactivated, and its products stay where they are.
        </p>
        <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink" onClick={() => setEditor("new")}>
          Add a category
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
          <input id="category-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, slug, or description" className={`${controlClassName} mt-2`} />
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
          <p className="mt-2 text-sm text-secondary">{categories.length === 0 ? "Add a category for the central catalogue." : "Try another name, slug, or status."}</p>
        </section>
      ) : null}
      {shown.kind === "ready" ? (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-card md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Products</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((category) => (
                  <tr key={category.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium">{category.name}</td>
                    <td className="px-4 py-3">{category.slug}</td>
                    <td className="px-4 py-3 text-secondary">{category.description ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={category.isActive ? "active" : "inactive"} />
                    </td>
                    <td className="px-4 py-3">{formatCount(category.productCount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" className="rounded-xl bg-lime px-3 py-2 font-display text-sm font-semibold text-ink" onClick={() => setEditor(category)}>
                          Edit
                        </button>
                        <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => setRemoveTarget(category)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {visible.map((category) => (
              <li key={category.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{category.name}</p>
                    <p className="text-sm text-muted">{category.slug}</p>
                  </div>
                  <StatusBadge value={category.isActive ? "active" : "inactive"} />
                </div>
                <p className="mt-3 text-sm text-secondary">{category.description ?? "No description."}</p>
                <p className="mt-3 text-sm">{formatCount(category.productCount)} products</p>
                <div className="mt-4 flex gap-2">
                  <button type="button" className="h-11 flex-1 rounded-xl bg-lime font-display text-sm font-semibold text-ink" onClick={() => setEditor(category)}>
                    Edit
                  </button>
                  <button type="button" className="h-11 flex-1 rounded-xl border border-line text-sm" onClick={() => setRemoveTarget(category)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
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

function CategoryEditor({
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
      setPending(false);
      if (!result.ok) {
        if (await redirect(result)) {
          return;
        }
        setFormError(result.message);
        return;
      }
      onSaved(`${result.data.name} was added.`);
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
    if (!updated.payload) {
      setFormError("No changes to save.");
      return;
    }
    setPending(true);
    setErrors({});
    const result = await updateCategory(client, category.id, updated.payload);
    setPending(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setFormError(result.message);
      return;
    }
    onSaved(`${result.data.name} was saved.`);
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
          <Field id="category-slug" label="Slug" error={errors["slug"]} hint={category ? "Lowercase letters, numbers, and hyphens." : "Optional. Leave blank and the server will make one from the name."}>
            <input id="category-slug" value={draft.slug} aria-invalid={Boolean(errors["slug"])} aria-describedby={describedBy("category-slug", errors["slug"], "Optional. Leave blank and the server will make one from the name.")} className={controlClassName} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
          </Field>
          <Field id="category-description" label="Description" error={errors["description"]} hint="Optional.">
            <textarea id="category-description" value={draft.description} rows={3} aria-invalid={Boolean(errors["description"])} aria-describedby={describedBy("category-description", errors["description"], "Optional.")} className={controlClassName} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
            <span>
              <span className="font-medium">Active</span>
              <span className="mt-1 block text-muted">Inactive categories stay out of new product assignments. Existing products keep this category.</span>
            </span>
          </label>
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
            {pending ? "Saving" : category ? "Save category" : "Create category"}
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
