import {
  adminProductCreateSchema,
  adminProductUpdateSchema,
  productUnitValues,
  type AdminProductCreate,
  type AdminProductUpdate,
} from "@ghartak/contracts";
import { rupeesToPaise } from "./money";

export type AttributeDraft = {
  name: string;
  value: string;
};

export type ProductDraft = {
  name: string;
  sku: string;
  categoryId: string;
  unit: string;
  packageSize: string;
  packageLabel: string;
  priceRupees: string;
  mrpRupees: string;
  openingStock: string;
  openingReason: string;
  brand: string;
  barcode: string;
  description: string;
  attributes: AttributeDraft[];
  publicationStatus: "draft" | "published" | "archived";
  isActive: boolean;
};

export type FieldErrors = Record<string, string>;

export type LoadedProduct = {
  name: string;
  sku: string;
  categoryId: string;
  unit: string;
  packageSize: string;
  packageLabel: string;
  brand: string;
  barcode: string;
  description: string;
  attributes: AttributeDraft[];
  publicationStatus: "draft" | "published" | "archived";
  isActive: boolean;
};

const units = new Set<string>(productUnitValues);

export function emptyProductDraft(): ProductDraft {
  return {
    name: "",
    sku: "",
    categoryId: "",
    unit: "",
    packageSize: "",
    packageLabel: "",
    priceRupees: "",
    mrpRupees: "",
    openingStock: "0",
    openingReason: "",
    brand: "",
    barcode: "",
    description: "",
    attributes: [],
    publicationStatus: "draft",
    isActive: true,
  };
}

export function validateCreate(input: ProductDraft): { ok: true; payload: AdminProductCreate } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const price = rupeesToPaise(input.priceRupees);
  if (!price.ok) {
    errors["priceRupees"] = price.message;
  }
  const mrp = input.mrpRupees.trim() ? rupeesToPaise(input.mrpRupees) : null;
  if (mrp && !mrp.ok) {
    errors["mrpRupees"] = mrp.message;
  } else if (mrp?.ok && price.ok && mrp.paise < price.paise) {
    errors["mrpRupees"] = "MRP cannot be below the selling price.";
  }
  const stock = parseStock(input.openingStock);
  if (!stock.ok) {
    errors["openingStock"] = stock.message;
  }
  const packageSize = parsePackageSize(input.packageSize);
  if (!packageSize.ok) {
    errors["packageSize"] = packageSize.message;
  }
  const attributes = cleanAttributes(input.attributes, errors);
  if (!units.has(input.unit)) {
    errors["unit"] = "Choose a unit.";
  }
  const candidate = {
    name: input.name,
    sku: input.sku,
    categoryId: input.categoryId,
    unit: input.unit,
    packageSize: packageSize.ok ? packageSize.value : 1,
    packageLabel: input.packageLabel,
    pricePaise: price.ok ? price.paise : 0,
    openingStockQuantity: stock.ok ? stock.value : 0,
    ...(mrp?.ok ? { mrpPaise: mrp.paise } : {}),
    ...(input.publicationStatus === "published" ? { publicationStatus: "published" as const } : {}),
    ...(input.brand.trim() ? { brand: input.brand } : {}),
    ...(input.barcode.trim() ? { barcode: input.barcode } : {}),
    ...(input.description.trim() ? { description: input.description } : {}),
    ...(attributes.length > 0 ? { attributes } : {}),
    ...(stock.ok && stock.value > 0 ? { openingReason: input.openingReason } : {}),
  };
  const parsed = adminProductCreateSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const [key, message] of Object.entries(issuesToErrors(parsed.error.issues))) {
      if (errors[key] === undefined) {
        errors[key] = message;
      }
    }
  }
  if (!price.ok || !stock.ok || !packageSize.ok || !parsed.success || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, payload: parsed.data };
}

export function validateUpdate(
  original: LoadedProduct,
  input: ProductDraft,
): { ok: true; payload: AdminProductUpdate | null } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const packageSize = parsePackageSize(input.packageSize);
  if (!packageSize.ok) {
    errors["packageSize"] = packageSize.message;
  }
  const attributes = cleanAttributes(input.attributes, errors);
  if (!units.has(input.unit)) {
    errors["unit"] = "Choose a unit.";
  }
  if (Object.keys(errors).length > 0 || !packageSize.ok) {
    return { ok: false, errors };
  }

  const next: LoadedProduct = {
    name: input.name.trim(),
    sku: input.sku.trim(),
    categoryId: input.categoryId,
    unit: input.unit,
    packageSize: String(packageSize.value),
    packageLabel: input.packageLabel.trim(),
    brand: input.brand.trim(),
    barcode: input.barcode.trim(),
    description: input.description.trim(),
    attributes,
    publicationStatus: original.publicationStatus === "archived" ? "archived" : input.publicationStatus,
    isActive: input.isActive,
  };
  const payload: Record<string, unknown> = {};
  if (next.name !== original.name) {
    payload["name"] = next.name;
  }
  if (next.sku !== original.sku) {
    payload["sku"] = next.sku;
  }
  if (next.categoryId !== original.categoryId) {
    payload["categoryId"] = next.categoryId;
  }
  if (next.unit !== original.unit) {
    payload["unit"] = next.unit;
  }
  if (next.packageSize !== original.packageSize) {
    payload["packageSize"] = packageSize.value;
  }
  if (next.packageLabel !== original.packageLabel) {
    payload["packageLabel"] = next.packageLabel;
  }
  if (next.brand !== original.brand) {
    payload["brand"] = next.brand.length > 0 ? next.brand : null;
  }
  if (next.barcode !== original.barcode) {
    payload["barcode"] = next.barcode.length > 0 ? next.barcode : null;
  }
  if (next.description !== original.description) {
    payload["description"] = next.description.length > 0 ? next.description : null;
  }
  if (JSON.stringify(next.attributes) !== JSON.stringify(original.attributes)) {
    payload["attributes"] = next.attributes;
  }
  if (original.publicationStatus !== "archived" && next.publicationStatus !== original.publicationStatus) {
    payload["publicationStatus"] = next.publicationStatus;
  }
  if (next.isActive !== original.isActive) {
    payload["isActive"] = next.isActive;
  }
  if (Object.keys(payload).length === 0) {
    return { ok: true, payload: null };
  }
  const parsed = adminProductUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, errors: issuesToErrors(parsed.error.issues) };
  }
  return { ok: true, payload: parsed.data };
}

export function restoreDraftPayload(): AdminProductUpdate {
  return { publicationStatus: "draft" };
}

function parseStock(input: string): { ok: true; value: number } | { ok: false; message: string } {
  if (!/^\d+$/.test(input.trim())) {
    return { ok: false, message: "Enter a whole number of units." };
  }
  const value = Number(input.trim());
  if (!Number.isSafeInteger(value)) {
    return { ok: false, message: "That stock quantity is too large." };
  }
  return { ok: true, value };
}

function parsePackageSize(input: string): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = input.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) {
    return { ok: false, message: "Enter a pack size greater than zero." };
  }
  return { ok: true, value: Number(trimmed) };
}

function cleanAttributes(attributes: AttributeDraft[], errors: FieldErrors): AttributeDraft[] {
  const cleaned: AttributeDraft[] = [];
  attributes.forEach((attribute, index) => {
    const name = attribute.name.trim();
    const value = attribute.value.trim();
    if (name.length === 0 && value.length === 0) {
      return;
    }
    if (name.length === 0 || value.length === 0) {
      errors[`attributes.${index}`] = "Enter both an attribute name and a value.";
      return;
    }
    cleaned.push({ name, value });
  });
  return cleaned;
}

function issuesToErrors(issues: Array<{ path: PropertyKey[]; message: string }>): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map((part) => String(part)).join(".") || "form";
    if (errors[key] === undefined) {
      errors[key] = friendlyMessage(key, issue.message);
    }
  }
  return errors;
}

function friendlyMessage(path: string, fallback: string): string {
  if (path === "name" || path.endsWith(".name") && !path.startsWith("attributes")) {
    return "Enter a product name.";
  }
  if (path === "sku") {
    return "Use uppercase letters, numbers, and single hyphens.";
  }
  if (path === "categoryId") {
    return "Choose a category.";
  }
  if (path === "packageLabel") {
    return "Enter the package label customers will see.";
  }
  if (path === "openingReason") {
    return "Opening stock requires a reason.";
  }
  if (path === "barcode") {
    return "Use 8 to 14 digits, or leave the barcode empty.";
  }
  if (path === "brand") {
    return "Enter a brand, or leave it empty.";
  }
  if (path.startsWith("attributes")) {
    return "Attribute names must be unique, with a name and value on each row.";
  }
  return fallback;
}
