import { z } from "zod";
import { paiseSchema, productUnitSchema } from "./marketplace.js";

export const catalogueProductSortValues = ["name", "price_asc", "price_desc", "newest"] as const;
export const customerAvailabilityValues = ["available", "out_of_stock"] as const;

const descriptionSummaryLength = 160;
const defaultPage = 1;
const defaultLimit = 20;
const maxLimit = 50;
const maxPage = 10_000;
const maxSearchLength = 80;

export const catalogueCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

export const catalogueImageSchema = z.object({
  id: z.uuid(),
  deliveryPath: z.string(),
  altText: z.string().nullable(),
  position: z.number().int().nonnegative(),
  isPrimary: z.boolean(),
});

export const catalogueStockSchema = z.object({
  quantity: z.number().int().nonnegative(),
  availability: z.enum(customerAvailabilityValues),
  purchasable: z.boolean(),
});

export const catalogueProductSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  descriptionSummary: z.string().max(descriptionSummaryLength).nullable(),
  category: catalogueCategorySchema,
  unit: productUnitSchema,
  packageSize: z.number().positive(),
  packageLabel: z.string(),
  pricePaise: paiseSchema,
  mrpPaise: paiseSchema.nullable().default(null),
  stock: catalogueStockSchema,
  primaryImage: catalogueImageSchema.nullable(),
});

export const catalogueAttributeSchema = z.object({
  name: z.string(),
  value: z.string(),
  position: z.number().int().nonnegative(),
});

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(maxLimit),
  total: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
});

export const categoryListItemSchema = catalogueCategorySchema.extend({
  imageDeliveryPath: z.string().nullable(),
});

export const categoryListResponseSchema = z.object({
  categories: z.array(categoryListItemSchema),
});

export const dailyTileSchema = z.object({
  position: z.number().int().min(1).max(4),
  label: z.string(),
  imageDeliveryPath: z.string().nullable(),
  categoryId: z.uuid().nullable(),
});

export const dailyTileListResponseSchema = z.object({
  tiles: z.array(dailyTileSchema),
});

export const productListResponseSchema = z.object({
  products: z.array(catalogueProductSummarySchema),
  pagination: paginationSchema,
});

export const productDetailResponseSchema = catalogueProductSummarySchema.extend({
  description: z.string().nullable(),
  images: z.array(catalogueImageSchema),
  attributes: z.array(catalogueAttributeSchema),
});

export const productListQuerySchema = z
  .object({
    page: z.number().int().min(1).max(maxPage),
    limit: z.number().int().min(1).max(maxLimit),
    categoryId: z.uuid().nullable(),
    search: z.string().min(1).max(maxSearchLength).nullable(),
    sort: z.enum(catalogueProductSortValues),
    minPrice: paiseSchema.nullable().describe("Minimum price in integer paise"),
    maxPrice: paiseSchema.nullable().describe("Maximum price in integer paise"),
    inStock: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.minPrice !== null && value.maxPrice !== null && value.minPrice > value.maxPrice) {
      context.addIssue({
        code: "custom",
        message: "minPrice cannot exceed maxPrice",
        path: ["minPrice"],
      });
    }
  });

export const productIdParamSchema = z.object({
  productId: z.uuid(),
});

export type CatalogueCategory = z.infer<typeof catalogueCategorySchema>;
export type CatalogueImage = z.infer<typeof catalogueImageSchema>;
export type CatalogueStock = z.infer<typeof catalogueStockSchema>;
export type CatalogueProductSummary = z.infer<typeof catalogueProductSummarySchema>;
export type CatalogueAttribute = z.infer<typeof catalogueAttributeSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductListResponse = z.infer<typeof productListResponseSchema>;
export type ProductDetailResponse = z.infer<typeof productDetailResponseSchema>;
export type DailyTile = z.infer<typeof dailyTileSchema>;
export type DailyTileListResponse = z.infer<typeof dailyTileListResponseSchema>;
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;
export type CatalogueProductSort = (typeof catalogueProductSortValues)[number];

export function parseProductListQuery(input: unknown): ProductListQuery {
  const record = queryRecord(input);
  return productListQuerySchema.parse({
    page: readInteger(record["page"], "page", { min: 1, max: maxPage }, defaultPage),
    limit: readInteger(record["limit"], "limit", { min: 1, max: maxLimit }, defaultLimit),
    categoryId: readUuid(record["categoryId"], "categoryId"),
    search: readSearch(record["search"]),
    sort: readSort(record["sort"]),
    minPrice: readInteger(record["minPrice"], "minPrice", { min: 0, max: Number.MAX_SAFE_INTEGER }, null),
    maxPrice: readInteger(record["maxPrice"], "maxPrice", { min: 0, max: Number.MAX_SAFE_INTEGER }, null),
    inStock: readBoolean(record["inStock"], "inStock"),
  });
}

export function parseProductIdParam(input: unknown): string {
  const record = queryRecord(input);
  return productIdParamSchema.parse({
    productId: readRequiredString(record["productId"], "productId"),
  }).productId;
}

export function summarizeDescription(description: string | null): string | null {
  if (description === null) {
    return null;
  }
  if (description.length <= descriptionSummaryLength) {
    return description;
  }
  return description.slice(0, descriptionSummaryLength);
}

function queryRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw queryError("query", "query must be an object");
  }
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      throw queryError(key, "provide a single value");
    }
    record[key] = value;
  }
  return record;
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw queryError(name, "is required");
  }
  return value;
}

function readInteger(
  value: unknown,
  name: string,
  bounds: { min: number; max: number },
  fallback: number | null,
): number | null {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw queryError(name, "must be a nonnegative integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    throw queryError(name, `must be between ${bounds.min} and ${bounds.max}`);
  }
  return parsed;
}

function readUuid(value: unknown, name: string): string | null {
  if (value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw queryError(name, "must be a UUID");
  }
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) {
    throw queryError(name, "must be a UUID");
  }
  return parsed.data;
}

function readSearch(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw queryError("search", "must be text");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxSearchLength) {
    throw queryError("search", `must be at most ${maxSearchLength} characters`);
  }
  return trimmed;
}

function readSort(value: unknown): CatalogueProductSort {
  if (value === undefined) {
    return "name";
  }
  if (typeof value !== "string") {
    throw queryError("sort", "is invalid");
  }
  const parsed = z.enum(catalogueProductSortValues).safeParse(value);
  if (!parsed.success) {
    throw queryError("sort", "must be name, price_asc, price_desc, or newest");
  }
  return parsed.data;
}

function readBoolean(value: unknown, name: string): boolean {
  if (value === undefined) {
    return false;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw queryError(name, "must be true or false");
}

function queryError(path: string, message: string): z.ZodError {
  return new z.ZodError([
    {
      code: "custom",
      message,
      path: [path],
    },
  ]);
}
