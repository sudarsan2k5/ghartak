import type { AdminProductCreate, AdminProductListQuery, AdminProductUpdate } from "@ghartak/contracts";
import {
  categories,
  imageCleanup,
  inventoryMovements,
  productAttributes,
  productImages,
  products,
  storeProducts,
  stores,
  withTransaction,
  type Database,
  type DatabaseTransaction,
} from "@ghartak/database";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { HttpError, isUniqueViolation } from "../../../http/errors.js";
import { listAdminImages } from "../images/image.service.js";

type AttributeInput = { name: string; value: string };

type ProductDetail = {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  barcode: string | null;
  description: string | null;
  category: { id: string; name: string; slug: string };
  unit: "piece" | "kg" | "g" | "litre" | "ml";
  packageSize: number;
  packageLabel: string;
  publicationStatus: "draft" | "published" | "archived";
  isActive: boolean;
  inventory: {
    pricePaise: number;
    mrpPaise: number | null;
    stockQuantity: number;
    availability: "available" | "unavailable" | "out_of_stock";
  };
  attributes: Array<{ name: string; value: string; position: number }>;
  images: Array<{
    id: string;
    deliveryPath: string;
    altText: string | null;
    position: number;
    isPrimary: boolean;
    deletionStatus: "pending_delete" | "failed" | null;
  }>;
};

export function createAdminProductService(db: Database) {
  return {
    async list(query: AdminProductListQuery) {
      const where = productWhere(query);
      const [counted] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .innerJoin(storeProducts, eq(storeProducts.productId, products.id))
        .where(where);
      const total = Number(counted?.total ?? 0);
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          sku: products.sku,
          barcode: products.barcode,
          categoryId: categories.id,
          categoryName: categories.name,
          categorySlug: categories.slug,
          unit: products.unit,
          packageLabel: products.packageLabel,
          publicationStatus: products.publicationStatus,
          isActive: products.isActive,
          pricePaise: storeProducts.pricePaise,
          mrpPaise: storeProducts.mrpPaise,
          stockQuantity: storeProducts.stockQuantity,
          availability: storeProducts.availability,
        })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .innerJoin(storeProducts, eq(storeProducts.productId, products.id))
        .where(where)
        .orderBy(asc(products.name), asc(products.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);
      const primaryImages = rows.length
        ? await db
            .select({ productId: productImages.productId, deliveryPath: productImages.deliveryPath })
            .from(productImages)
            .where(
              and(
                inArray(productImages.productId, rows.map((row) => row.id)),
                eq(productImages.isPrimary, true),
                sql`not exists (
                  select 1 from ${imageCleanup}
                  where ${imageCleanup.imageId} = ${productImages.id}
                    and ${imageCleanup.operation} = 'delete'
                    and ${imageCleanup.status} = 'pending_delete'
                )`,
              ),
            )
        : [];
      const imageByProduct = new Map(primaryImages.map((image) => [image.productId, image.deliveryPath]));
      return {
        products: rows.map((row) => ({
          primaryImagePath: imageByProduct.get(row.id) ?? null,
          id: row.id,
          name: row.name,
          brand: row.brand,
          sku: row.sku,
          barcode: row.barcode,
          category: { id: row.categoryId, name: row.categoryName, slug: row.categorySlug },
          unit: row.unit,
          packageLabel: row.packageLabel,
          publicationStatus: row.publicationStatus,
          isActive: row.isActive,
          inventory: {
            pricePaise: row.pricePaise,
      mrpPaise: row.mrpPaise,
            stockQuantity: row.stockQuantity,
            availability: row.availability,
          },
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pageCount: total === 0 ? 0 : Math.ceil(total / query.limit),
        },
      };
    },

    async get(productId: string) {
      return requireProduct(db, productId);
    },

    async create(input: AdminProductCreate, actorUserId: string) {
      try {
        return await withTransaction(db, async (tx) => {
          await requireCategory(tx, input.categoryId);
          const [product] = await tx
            .insert(products)
            .values({
              categoryId: input.categoryId,
              name: input.name,
              brand: input.brand ?? null,
              description: input.description ?? null,
              sku: input.sku,
              barcode: input.barcode ?? null,
              unit: input.unit,
              packageSize: input.packageSize,
              packageLabel: input.packageLabel,
              publicationStatus: input.publicationStatus ?? "draft",
              isActive: input.isActive ?? true,
            })
            .returning({ id: products.id });
          if (!product) {
            throw new HttpError(500, "Product could not be created");
          }
          await replaceAttributes(tx, product.id, input.attributes ?? []);
          const [listing] = await tx
            .insert(storeProducts)
            .values({
              storeId: await fulfilmentId(tx),
              productId: product.id,
              pricePaise: input.pricePaise,
              mrpPaise: input.mrpPaise ?? null,
              stockQuantity: input.openingStockQuantity,
              availability: input.openingStockQuantity > 0 ? "available" : "out_of_stock",
            })
            .returning({ id: storeProducts.id });
          if (!listing) {
            throw new HttpError(500, "Product could not be created");
          }
          if (input.openingStockQuantity > 0) {
            await tx.insert(inventoryMovements).values({
              storeProductId: listing.id,
              movementType: "addition",
              quantityDelta: input.openingStockQuantity,
              stockAfter: input.openingStockQuantity,
              reason: input.openingReason ?? null,
              actorUserId,
            });
          }
          return requireProduct(tx, product.id);
        });
      } catch (error) {
        throw mapProductConflict(error);
      }
    },

    async update(productId: string, input: AdminProductUpdate) {
      try {
        return await withTransaction(db, async (tx) => {
          const existing = await requireProduct(tx, productId);
          if (input.categoryId) {
            await requireCategory(tx, input.categoryId);
          }
          await tx
            .update(products)
            .set({
              name: input.name ?? existing.name,
              brand: input.brand === undefined ? existing.brand : input.brand,
              sku: input.sku ?? existing.sku,
              barcode: input.barcode === undefined ? existing.barcode : input.barcode,
              description: input.description === undefined ? existing.description : input.description,
              categoryId: input.categoryId ?? existing.category.id,
              unit: input.unit ?? existing.unit,
              packageSize: input.packageSize ?? existing.packageSize,
              packageLabel: input.packageLabel ?? existing.packageLabel,
              publicationStatus: input.publicationStatus ?? existing.publicationStatus,
              isActive: input.isActive ?? existing.isActive,
            })
            .where(eq(products.id, productId));
          if (input.attributes) {
            await replaceAttributes(tx, productId, input.attributes);
          }
          return requireProduct(tx, productId);
        });
      } catch (error) {
        throw mapProductConflict(error);
      }
    },

    async archive(productId: string) {
      return withTransaction(db, async (tx) => {
        await requireProduct(tx, productId);
        await tx
          .update(products)
          .set({ publicationStatus: "archived", isActive: false })
          .where(eq(products.id, productId));
        return requireProduct(tx, productId);
      });
    },
  };
}

function productWhere(query: AdminProductListQuery): SQL | undefined {
  const filters: SQL[] = [];
  if (query.categoryId) {
    filters.push(eq(products.categoryId, query.categoryId));
  }
  if (query.publicationStatus) {
    filters.push(eq(products.publicationStatus, query.publicationStatus));
  }
  if (query.search) {
    const pattern = `%${query.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    filters.push(
      sql`(${products.name} ILIKE ${pattern} ESCAPE '\\' or ${products.brand} ILIKE ${pattern} ESCAPE '\\' or ${products.sku} ILIKE ${pattern} ESCAPE '\\')`,
    );
  }
  return filters.length > 0 ? and(...filters) : undefined;
}

async function findProduct(db: Database | DatabaseTransaction, productId: string): Promise<ProductDetail | null> {
  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      sku: products.sku,
      barcode: products.barcode,
      description: products.description,
      categoryId: categories.id,
      categoryName: categories.name,
      categorySlug: categories.slug,
      unit: products.unit,
      packageSize: products.packageSize,
      packageLabel: products.packageLabel,
      publicationStatus: products.publicationStatus,
      isActive: products.isActive,
      pricePaise: storeProducts.pricePaise,
      mrpPaise: storeProducts.mrpPaise,
      stockQuantity: storeProducts.stockQuantity,
      availability: storeProducts.availability,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(storeProducts, eq(storeProducts.productId, products.id))
    .where(eq(products.id, productId))
    .limit(1);
  if (!row) {
    return null;
  }
  const attributes = await db
    .select({
      name: productAttributes.name,
      value: productAttributes.value,
      position: productAttributes.position,
    })
    .from(productAttributes)
    .where(eq(productAttributes.productId, productId))
    .orderBy(asc(productAttributes.position));
  const images = await listAdminImages(db, productId);
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    sku: row.sku,
    barcode: row.barcode,
    description: row.description,
    category: { id: row.categoryId, name: row.categoryName, slug: row.categorySlug },
    unit: row.unit,
    packageSize: Number(row.packageSize),
    packageLabel: row.packageLabel,
    publicationStatus: row.publicationStatus,
    isActive: row.isActive,
    inventory: {
      pricePaise: row.pricePaise,
            mrpPaise: row.mrpPaise,
      stockQuantity: row.stockQuantity,
      availability: row.availability,
    },
    attributes,
    images,
  };
}

async function requireProduct(db: Database | DatabaseTransaction, productId: string): Promise<ProductDetail> {
  const product = await findProduct(db, productId);
  if (!product) {
    throw new HttpError(404, "Product not found");
  }
  return product;
}

async function requireCategory(tx: DatabaseTransaction, categoryId: string): Promise<void> {
  const [category] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!category) {
    throw new HttpError(400, "Category not found");
  }
}

async function fulfilmentId(tx: DatabaseTransaction): Promise<string> {
  const [store] = await tx.select({ id: stores.id }).from(stores).limit(1);
  if (!store) {
    throw new HttpError(500, "The fulfilment location is missing");
  }
  return store.id;
}

async function replaceAttributes(tx: DatabaseTransaction, productId: string, attributes: AttributeInput[]): Promise<void> {
  await tx.delete(productAttributes).where(eq(productAttributes.productId, productId));
  if (attributes.length === 0) {
    return;
  }
  await tx.insert(productAttributes).values(
    attributes.map((attribute, position) => ({
      productId,
      name: attribute.name,
      value: attribute.value,
      position,
    })),
  );
}

function mapProductConflict(error: unknown): unknown {
  const unique = isUniqueViolation(error);
  if (!unique) {
    return error;
  }
  if (unique.constraint === "products_sku_unique") {
    return new HttpError(409, "A product with that SKU already exists");
  }
  if (unique.constraint === "products_barcode_unique") {
    return new HttpError(409, "A product with that barcode already exists");
  }
  return new HttpError(409, "That value is already in use");
}
