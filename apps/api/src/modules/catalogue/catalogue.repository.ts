import type { ProductListQuery } from "@ghartak/contracts";
import {
  categories,
  homeDailyTiles,
  imageCleanup,
  productAttributes,
  productImages,
  products,
  storeProducts,
  type Database,
} from "@ghartak/database";
import { and, asc, desc, eq, gt, gte, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";

const customerVisible = and(
  eq(products.publicationStatus, "published"),
  eq(products.isActive, true),
  eq(categories.isActive, true),
  ne(storeProducts.availability, "unavailable"),
);

export type CatalogueProductRow = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  unit: "piece" | "kg" | "g" | "litre" | "ml";
  packageSize: number;
  packageLabel: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  pricePaise: number;
  mrpPaise: number | null;
  stockQuantity: number;
  availability: "available" | "unavailable" | "out_of_stock";
};

export type CatalogueImageRow = {
  id: string;
  productId: string;
  deliveryPath: string;
  altText: string | null;
  position: number;
  isPrimary: boolean;
};

export type CatalogueAttributeRow = {
  productId: string;
  name: string;
  value: string;
  position: number;
};

export function createCatalogueRepository(db: Database) {
  return {
    async listCategories() {
      return db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          imageDeliveryPath: categories.imageDeliveryPath,
        })
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.sortOrder), asc(categories.name), asc(categories.id));
    },

    async listDailyTiles() {
      return db
        .select({
          position: homeDailyTiles.position,
          label: homeDailyTiles.label,
          imageDeliveryPath: homeDailyTiles.imageDeliveryPath,
          categoryId: sql<string | null>`case when ${categories.isActive} then ${categories.id} end`,
        })
        .from(homeDailyTiles)
        .leftJoin(categories, eq(homeDailyTiles.categoryId, categories.id))
        .orderBy(asc(homeDailyTiles.position));
    },

    async listProducts(query: ProductListQuery): Promise<{ rows: CatalogueProductRow[]; total: number }> {
      const where = visibilityWhere(query);
      const [counted] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .innerJoin(storeProducts, eq(storeProducts.productId, products.id))
        .where(where);
      const total = numberValue(counted?.total ?? 0);
      const rows = await db
        .select(productSelection())
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .innerJoin(storeProducts, eq(storeProducts.productId, products.id))
        .where(where)
        .orderBy(...productOrder(query.sort))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);
      return { rows: rows.map(normalizeProduct), total };
    },

    async findProduct(productId: string): Promise<CatalogueProductRow | null> {
      const [row] = await db
        .select(productSelection())
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .innerJoin(storeProducts, eq(storeProducts.productId, products.id))
        .where(and(customerVisible, eq(products.id, productId)))
        .limit(1);
      return row ? normalizeProduct(row) : null;
    },

    async listPrimaryImages(productIds: readonly string[]): Promise<CatalogueImageRow[]> {
      if (productIds.length === 0) {
        return [];
      }
      const rows = await db
        .select(imageSelection())
        .from(productImages)
        .where(
          and(
            inArray(productImages.productId, [...productIds]),
            eq(productImages.isPrimary, true),
            activeProductImage(),
          ),
        )
        .orderBy(asc(productImages.position), asc(productImages.id));
      return rows;
    },

    async listImages(productId: string): Promise<CatalogueImageRow[]> {
      return db
        .select(imageSelection())
        .from(productImages)
        .where(and(eq(productImages.productId, productId), activeProductImage()))
        .orderBy(asc(productImages.position), asc(productImages.id));
    },

    async listAttributes(productId: string): Promise<CatalogueAttributeRow[]> {
      return db
        .select({
          productId: productAttributes.productId,
          name: productAttributes.name,
          value: productAttributes.value,
          position: productAttributes.position,
        })
        .from(productAttributes)
        .where(eq(productAttributes.productId, productId))
        .orderBy(asc(productAttributes.position), asc(productAttributes.id));
    },
  };
}

function visibilityWhere(query: ProductListQuery): SQL | undefined {
  const filters: SQL[] = [];
  if (customerVisible) {
    filters.push(customerVisible);
  }
  if (query.categoryId) {
    filters.push(eq(products.categoryId, query.categoryId));
  }
  if (query.search) {
    const pattern = `%${escapeLike(query.search)}%`;
    const search = or(
      sql`${products.name} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${products.brand} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${products.sku} ILIKE ${pattern} ESCAPE '\\'`,
    );
    if (search) {
      filters.push(search);
    }
  }
  if (query.minPrice !== null) {
    filters.push(gte(storeProducts.pricePaise, query.minPrice));
  }
  if (query.maxPrice !== null) {
    filters.push(lte(storeProducts.pricePaise, query.maxPrice));
  }
  if (query.inStock) {
    const inStock = and(eq(storeProducts.availability, "available"), gt(storeProducts.stockQuantity, 0));
    if (inStock) {
      filters.push(inStock);
    }
  }
  return and(...filters);
}

function productOrder(sort: ProductListQuery["sort"]): SQL[] {
  const id = asc(products.id);
  if (sort === "price_asc") {
    return [asc(storeProducts.pricePaise), id];
  }
  if (sort === "price_desc") {
    return [desc(storeProducts.pricePaise), id];
  }
  if (sort === "newest") {
    return [desc(products.createdAt), id];
  }
  return [asc(products.name), id];
}

function productSelection() {
  return {
    id: products.id,
    name: products.name,
    brand: products.brand,
    description: products.description,
    unit: products.unit,
    packageSize: products.packageSize,
    packageLabel: products.packageLabel,
    categoryId: categories.id,
    categoryName: categories.name,
    categorySlug: categories.slug,
    pricePaise: storeProducts.pricePaise,
    mrpPaise: storeProducts.mrpPaise,
    stockQuantity: storeProducts.stockQuantity,
    availability: storeProducts.availability,
  };
}

function activeProductImage(): SQL {
  return sql`not exists (
    select 1 from ${imageCleanup}
    where ${imageCleanup.imageId} = ${productImages.id}
      and ${imageCleanup.operation} = 'delete'
      and ${imageCleanup.status} = 'pending_delete'
  )`;
}

function imageSelection() {
  return {
    id: productImages.id,
    productId: productImages.productId,
    deliveryPath: productImages.deliveryPath,
    altText: productImages.altText,
    position: productImages.position,
    isPrimary: productImages.isPrimary,
  };
}

function normalizeProduct(row: {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  unit: CatalogueProductRow["unit"];
  packageSize: number;
  packageLabel: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  pricePaise: number;
  mrpPaise: number | null;
  stockQuantity: number;
  availability: CatalogueProductRow["availability"];
}): CatalogueProductRow {
  return {
    ...row,
    packageSize: numberValue(row.packageSize),
    pricePaise: numberValue(row.pricePaise),
    mrpPaise: row.mrpPaise === null ? null : numberValue(row.mrpPaise),
    stockQuantity: numberValue(row.stockQuantity),
  };
}

function numberValue(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("catalogue query returned a non-numeric value");
  }
  return parsed;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
