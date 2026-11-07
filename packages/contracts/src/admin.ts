import { z } from "zod";
import {
  paiseSchema,
  productPublicationStatusSchema,
  productUnitSchema,
  storeProductAvailabilitySchema,
} from "./marketplace.js";

const nameSchema = z.string().trim().min(1).max(160);
const reasonSchema = z.string().trim().min(1).max(200);
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const packageLabelSchema = z.string().trim().min(1).max(80);

export const adminLoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12).max(128),
});

export const adminSessionResponseSchema = z.object({
  expiresAt: z.iso.datetime(),
  admin: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
  }),
});

export const adminProductCreateSchema = z.object({
  name: nameSchema,
  brand: z.string().trim().min(1).max(120).nullable().optional(),
  description: z.string().trim().min(1).max(4000).nullable().optional(),
  categoryId: z.uuid(),
  unit: productUnitSchema,
  packageSize: z.number().positive(),
  packageLabel: packageLabelSchema,
  publicationStatus: productPublicationStatusSchema.optional(),
  isActive: z.boolean().optional(),
  pricePaise: paiseSchema,
  mrpPaise: paiseSchema.nullable().optional(),
  openingStockQuantity: z.number().int().nonnegative(),
  openingReason: reasonSchema.optional(),
}).superRefine((value, ctx) => {
  if (typeof value.mrpPaise === "number" && value.mrpPaise < value.pricePaise) {
    ctx.addIssue({ code: "custom", path: ["mrpPaise"], message: "MRP cannot be below the selling price" });
  }
  if (value.openingStockQuantity > 0 && !value.openingReason) {
    ctx.addIssue({
      code: "custom",
      path: ["openingReason"],
      message: "Opening stock requires a reason",
    });
  }
});

export const adminProductUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    brand: z.string().trim().min(1).max(120).nullable().optional(),
    description: z.string().trim().min(1).max(4000).nullable().optional(),
    categoryId: z.uuid().optional(),
    unit: productUnitSchema.optional(),
    packageSize: z.number().positive().optional(),
    packageLabel: packageLabelSchema.optional(),
    publicationStatus: productPublicationStatusSchema.optional(),
    isActive: z.boolean().optional(),
    })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const adminCategoryCreateSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  description: z.string().trim().min(1).max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const adminCategoryUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const adminCategoryOrderSchema = z.object({
  categoryIds: z.array(z.uuid()).min(1).refine((ids) => new Set(ids).size === ids.length, { message: "Category ids must be unique" }),
});

export const adminPriceUpdateSchema = z
  .object({
    pricePaise: paiseSchema,
    mrpPaise: paiseSchema.nullable().optional(),
  })
  .refine((value) => typeof value.mrpPaise !== "number" || value.mrpPaise >= value.pricePaise, {
    path: ["mrpPaise"],
    message: "MRP cannot be below the selling price",
  });

export const adminStockChangeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("addition"),
    quantity: z.number().int().positive().max(1_000_000),
    reason: reasonSchema,
  }),
  z.object({
    type: z.literal("removal"),
    quantity: z.number().int().positive().max(1_000_000),
    reason: reasonSchema,
  }),
  z.object({
    type: z.literal("adjustment"),
    quantityDelta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
    reason: reasonSchema,
  }),
]);

export const adminImageUpdateSchema = z
  .object({
    altText: z.string().trim().min(1).max(200).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const adminImageOrderSchema = z.object({
  imageIds: z.array(z.uuid()).min(1).max(20),
});

export const adminCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  imageDeliveryPath: z.string().nullable(),
  productCount: z.number().int().nonnegative(),
});

export const adminCategoryListResponseSchema = z.object({
  categories: z.array(adminCategorySchema),
});

export const adminDailyTileSchema = z.object({
  position: z.number().int().min(1).max(4),
  label: z.string(),
  imageDeliveryPath: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
});

export const adminDailyTileListResponseSchema = z.object({
  tiles: z.array(adminDailyTileSchema),
});

export const adminDailyTileUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(40).optional(),
    categoryId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const adminInventorySchema = z.object({
  pricePaise: paiseSchema,
  mrpPaise: paiseSchema.nullable().default(null),
  stockQuantity: z.number().int().nonnegative(),
  availability: storeProductAvailabilitySchema,
});

export const adminImageDeletionStatusSchema = z.enum(["pending_delete", "failed"]);

export const adminImageSchema = z.object({
  id: z.uuid(),
  deliveryPath: z.string(),
  altText: z.string().nullable(),
  position: z.number().int().nonnegative(),
  isPrimary: z.boolean(),
  deletionStatus: adminImageDeletionStatusSchema.nullable().optional(),
});

export const adminImageListResponseSchema = z.object({
  images: z.array(adminImageSchema),
  image: adminImageSchema.optional(),
  deletion: z
    .object({
      status: z.enum(["pending_delete", "deleted", "failed", "cancelled"]),
      imageId: z.uuid(),
    })
    .optional(),
});

export const adminProductSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  category: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  unit: productUnitSchema,
  packageLabel: z.string(),
  publicationStatus: productPublicationStatusSchema,
  isActive: z.boolean(),
  inventory: adminInventorySchema,
  primaryImagePath: z.string().nullable().default(null),
});

export const adminProductSchema = adminProductSummarySchema.extend({
  description: z.string().nullable(),
  packageSize: z.number().positive(),
  images: z.array(adminImageSchema),
});

export const adminProductListResponseSchema = z.object({
  products: z.array(adminProductSummarySchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative(),
  }),
});

export const adminStockMovementSchema = z.object({
  id: z.uuid(),
  movementType: z.enum(["addition", "removal", "adjustment"]),
  quantityDelta: z.number().int(),
  stockAfter: z.number().int().nonnegative(),
  reason: z.string().nullable(),
});

export const adminStockResponseSchema = z.object({
  productId: z.uuid(),
  inventory: adminInventorySchema,
  movement: adminStockMovementSchema,
});

export const adminPriceResponseSchema = z.object({
  productId: z.uuid(),
  inventory: adminInventorySchema,
});

export const adminProductListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  categoryId: z.uuid().optional(),
  search: z.string().trim().max(80).optional(),
  publicationStatus: productPublicationStatusSchema.optional(),
});

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;
export type AdminProductCreate = z.infer<typeof adminProductCreateSchema>;
export type AdminProductUpdate = z.infer<typeof adminProductUpdateSchema>;
export type AdminCategoryOrder = z.infer<typeof adminCategoryOrderSchema>;
export type AdminDailyTileUpdate = z.infer<typeof adminDailyTileUpdateSchema>;
export type AdminCategoryCreate = z.infer<typeof adminCategoryCreateSchema>;
export type AdminCategoryUpdate = z.infer<typeof adminCategoryUpdateSchema>;
export type AdminPriceUpdate = z.infer<typeof adminPriceUpdateSchema>;
export type AdminStockChange = z.infer<typeof adminStockChangeSchema>;
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;
