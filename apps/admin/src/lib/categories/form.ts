import { adminCategoryCreateSchema, adminCategoryUpdateSchema, type AdminCategoryCreate, type AdminCategoryUpdate } from "@ghartak/contracts";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CategoryDraft = {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
};

export type StoredCategory = {
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
};

export function emptyCategoryDraft(): CategoryDraft {
  return { name: "", slug: "", description: "", isActive: true };
}

export function validateCreate(draft: CategoryDraft): { ok: true; payload: AdminCategoryCreate } | { ok: false; errors: Record<string, string> } {
  const fields = readFields(draft);
  if (!fields.ok) {
    return fields;
  }
  const payload: AdminCategoryCreate = {
    name: fields.name,
    isActive: draft.isActive,
    ...(fields.slug ? { slug: fields.slug } : {}),
    ...(fields.description ? { description: fields.description } : {}),
  };
  const parsed = adminCategoryCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, errors: { form: "The category does not match the catalogue rules." } };
  }
  return { ok: true, payload: parsed.data };
}

export function validateUpdate(
  original: StoredCategory,
  draft: CategoryDraft,
): { ok: true; payload: AdminCategoryUpdate | null } | { ok: false; errors: Record<string, string> } {
  const fields = readFields(draft);
  if (!fields.ok) {
    return fields;
  }
  const description = fields.description.length > 0 ? fields.description : null;
  const payload: AdminCategoryUpdate = {
    ...(fields.name !== original.name ? { name: fields.name } : {}),
    ...(fields.slug !== original.slug ? { slug: fields.slug } : {}),
    ...(description !== original.description ? { description } : {}),
    ...(draft.isActive !== original.isActive ? { isActive: draft.isActive } : {}),
  };
  if (Object.keys(payload).length === 0) {
    return { ok: true, payload: null };
  }
  const parsed = adminCategoryUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, errors: { form: "The category does not match the catalogue rules." } };
  }
  return { ok: true, payload: parsed.data };
}

export type CategoryChoice = {
  id: string;
  name: string;
  isActive: boolean;
};

export function assignableCategories(categories: readonly CategoryChoice[], currentCategoryId?: string): CategoryChoice[] {
  return categories.filter((category) => category.isActive || category.id === currentCategoryId);
}

export function categoryOptionLabel(category: CategoryChoice): string {
  return category.isActive ? category.name : `${category.name} (inactive)`;
}

export function filterCategories<T extends { name: string; slug: string; description: string | null; isActive: boolean }>(
  categories: readonly T[],
  query: string,
  status: "" | "active" | "inactive",
): T[] {
  const needle = query.trim().toLowerCase();
  return categories.filter((category) => {
    if (status === "active" && !category.isActive) {
      return false;
    }
    if (status === "inactive" && category.isActive) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return [category.name, category.slug, category.description ?? ""].some((value) => value.toLowerCase().includes(needle));
  });
}

export function categoryListView(input: { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; count: number }):
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready" } {
  if (input.phase === "loading") {
    return { kind: "loading" };
  }
  if (input.phase === "error") {
    return { kind: "error", message: input.message };
  }
  return input.count === 0 ? { kind: "empty" } : { kind: "ready" };
}

export function deleteIntent(category: { productCount: number; isActive: boolean }): "confirm-delete" | "offer-deactivate" | "blocked" {
  if (category.productCount === 0) {
    return "confirm-delete";
  }
  return category.isActive ? "offer-deactivate" : "blocked";
}

function readFields(draft: CategoryDraft): { ok: true; name: string; slug: string; description: string } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  const slug = draft.slug.trim();
  const description = draft.description.trim();
  if (name.length === 0) {
    errors["name"] = "Enter a category name.";
  } else if (name.length > 160) {
    errors["name"] = "Use 160 characters or fewer.";
  }
  if (slug.length > 0 && !slugPattern.test(slug)) {
    errors["slug"] = "Use lowercase letters, numbers, and single hyphens.";
  }
  if (description.length > 500) {
    errors["description"] = "Use 500 characters or fewer.";
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, name, slug, description };
}
