import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  categoryListResponseSchema,
  errorResponseSchema,
  productDetailResponseSchema,
  productListResponseSchema,
} from "@ghartak/contracts";
import {
  categories,
  closeDatabase,
  openDatabase,
  productImages,
  products,
  storeProducts,
  stores,
  type Database,
} from "@ghartak/database";
import { insertSampleCatalogue, removeSampleCatalogue } from "@ghartak/database/sample-catalogue";
import { eq, like } from "drizzle-orm";
import type { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import { createLogger } from "../src/logger.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const slugSuffix = suffix.toLowerCase();

type Fixture = {
  activeCategoryId: string;
  inactiveCategoryId: string;
  publishedId: string;
  draftId: string;
  archivedId: string;
  inactiveProductId: string;
  inactiveCategoryProductId: string;
  unavailableId: string;
  zeroStockId: string;
  plainId: string;
  brandId: string;
  primaryImageId: string;
  secondaryImageId: string;
};

let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let fixture: Fixture;
let storeId: string;

describe("customer catalogue", () => {
  before(async () => {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    db = openDatabase(connectionString);
    await removeFixtures(db);
    await insertSampleCatalogue(db);
    const [store] = await db.select({ id: stores.id }).from(stores).limit(1);
    if (!store) {
      throw new Error("fulfilment location is missing");
    }
    storeId = store.id;
    fixture = await insertFixtures(db, storeId);
    app = await buildApp({
      logger: createLogger("silent"),
      db,
      redis: {} as Redis,
    });
  });

  after(async () => {
    await removeFixtures(db);
    await removeSampleCatalogue(db);
    await app.close();
    await closeDatabase();
  });

  it("lists active categories", async () => {
    const body = categoryListResponseSchema.parse(await getJson(app, "/api/v1/categories"));
    const slugs = body.categories.map((category) => category.slug);
    assert.ok(slugs.includes("staples"));
    assert.ok(slugs.includes("dairy"));
    assert.ok(slugs.includes("produce"));
    assert.ok(slugs.includes(`test-active-${slugSuffix}`));
    assert.equal(slugs.includes(`test-inactive-${slugSuffix}`), false);
    const ordered = [...body.categories].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
    assert.deepEqual(body.categories, ordered);
    assert.equal("imageUrl" in (body.categories[0] ?? {}), false);
  });

  it("lists published products with central prices", async () => {
    const body = productListResponseSchema.parse(await getJson(app, "/api/v1/products?limit=50"));
    const prices = new Map(body.products.map((product) => [product.name, product.pricePaise]));
    assert.equal(prices.get("Toor Dal"), 12000);
    assert.equal(prices.get("Wheat Atta"), 25000);
    assert.equal(prices.get("Toned Milk"), 5600);
    assert.equal(prices.get("Tomato"), 4000);
    assert.equal(prices.get("Onion"), 3000);
    assert.equal(body.products.some((product) => product.id === fixture.draftId), false);
    assert.equal(body.products.some((product) => product.id === fixture.archivedId), false);
    assert.equal(body.products.some((product) => product.id === fixture.inactiveProductId), false);
    assert.equal(body.products.some((product) => product.id === fixture.inactiveCategoryProductId), false);
    assert.equal(body.products.some((product) => product.id === fixture.unavailableId), false);
    assert.equal(body.pagination.total, body.products.length);
  });

  it("returns product details with images", async () => {
    const listed = productListResponseSchema.parse(
      await getJson(app, "/api/v1/products?search=Toor%20Dal&limit=10"),
    );
    const dal = listed.products.find((product) => product.name === "Toor Dal");
    assert.ok(dal);
    const detail = productDetailResponseSchema.parse(await getJson(app, `/api/v1/products/${dal.id}`));
    assert.equal(detail.pricePaise, 12000);
    assert.equal(detail.stock.quantity, 40);
    assert.equal(detail.stock.purchasable, true);
    assert.equal(detail.brand, "Ghartak Staples");
    assert.equal(detail.images.length, 2);
    assert.deepEqual(
      detail.images.map((image) => image.position),
      [0, 1],
    );
    assert.equal(detail.images.filter((image) => image.isPrimary).length, 1);
    assert.equal(detail.primaryImage?.isPrimary, true);
    assert.equal("objectKey" in (detail.images[0] ?? {}), false);
    assert.equal("storageProvider" in (detail.images[0] ?? {}), false);
    assert.equal(detail.images[0]?.deliveryPath, "/catalog/toor-dal/primary.jpg");
  });

  it("filters by category", async () => {
    const [staples] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "staples"));
    assert.ok(staples);
    const body = productListResponseSchema.parse(
      await getJson(app, `/api/v1/products?categoryId=${staples.id}&limit=50`),
    );
    assert.deepEqual(
      body.products.map((product) => product.name),
      ["Toor Dal", "Wheat Atta"],
    );
  });

  it("searches name and brand without case sensitivity", async () => {
    const byName = productListResponseSchema.parse(await getJson(app, "/api/v1/products?search=toned%20milk"));
    assert.ok(byName.products.some((product) => product.name === "Toned Milk"));
    const byBrand = productListResponseSchema.parse(await getJson(app, `/api/v1/products?search=zephyr%20${slugSuffix}`));
    assert.deepEqual(
      byBrand.products.map((product) => product.id),
      [fixture.brandId],
    );
    const blank = productListResponseSchema.parse(await getJson(app, "/api/v1/products?search=%20%20&limit=50"));
    assert.equal(blank.pagination.total, 9);
  });

  it("paginates with a stable order", async () => {
    const [staples] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "staples"));
    assert.ok(staples);
    const first = productListResponseSchema.parse(
      await getJson(app, `/api/v1/products?categoryId=${staples.id}&limit=1&page=1&sort=name`),
    );
    const second = productListResponseSchema.parse(
      await getJson(app, `/api/v1/products?categoryId=${staples.id}&limit=1&page=2&sort=name`),
    );
    assert.equal(first.pagination.total, 2);
    assert.equal(first.pagination.pageCount, 2);
    assert.equal(first.products[0]?.name, "Toor Dal");
    assert.equal(second.products[0]?.name, "Wheat Atta");
    assert.notEqual(first.products[0]?.id, second.products[0]?.id);
  });

  it("sorts by price", async () => {
    const [produce] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "produce"));
    assert.ok(produce);
    const body = productListResponseSchema.parse(
      await getJson(app, `/api/v1/products?categoryId=${produce.id}&sort=price_asc&limit=10`),
    );
    assert.deepEqual(
      body.products.map((product) => product.pricePaise),
      [3000, 4000],
    );
  });

  it("filters price in paise and in-stock products", async () => {
    const priced = productListResponseSchema.parse(
      await getJson(app, "/api/v1/products?minPrice=10000&maxPrice=13000&limit=50"),
    );
    assert.deepEqual(
      priced.products.map((product) => product.name),
      ["Toor Dal"],
    );
    const stocked = productListResponseSchema.parse(
      await getJson(app, `/api/v1/products?search=test%20empty%20${slugSuffix}&inStock=true`),
    );
    assert.equal(stocked.products.length, 0);
    const visible = productListResponseSchema.parse(
      await getJson(app, `/api/v1/products?search=test%20empty%20${slugSuffix}`),
    );
    assert.equal(visible.products.length, 1);
    assert.equal(visible.products[0]?.stock.quantity, 0);
    assert.equal(visible.products[0]?.stock.availability, "out_of_stock");
    assert.equal(visible.products[0]?.stock.purchasable, false);
  });

  it("hides draft, archived, inactive, and disabled products", async () => {
    for (const productId of [
      fixture.draftId,
      fixture.archivedId,
      fixture.inactiveProductId,
      fixture.inactiveCategoryProductId,
      fixture.unavailableId,
    ]) {
      const response = await app.inject({ method: "GET", url: `/api/v1/products/${productId}` });
      assert.equal(response.statusCode, 404);
      assert.equal(errorResponseSchema.parse(response.json()).error.code, "not_found");
    }
  });

  it("returns gallery order and one primary image", async () => {
    const detail = productDetailResponseSchema.parse(
      await getJson(app, `/api/v1/products/${fixture.publishedId}`),
    );
    assert.deepEqual(
      detail.images.map((image) => image.id),
      [fixture.primaryImageId, fixture.secondaryImageId],
    );
    assert.equal(detail.images.filter((image) => image.isPrimary).length, 1);
  });

  it("rejects invalid queries and ids", async () => {
    for (const url of [
      "/api/v1/products?limit=0",
      "/api/v1/products?limit=51",
      "/api/v1/products?page=0",
      "/api/v1/products?sort=cheapest",
      "/api/v1/products?minPrice=10.5",
      "/api/v1/products?minPrice=5000&maxPrice=1000",
      "/api/v1/products?categoryId=not-a-uuid",
      "/api/v1/products?inStock=yes",
      "/api/v1/products?search=milk&search=dal",
    ]) {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.statusCode, 400, url);
      assert.equal(errorResponseSchema.parse(response.json()).error.code, "request_error");
    }
    const invalidId = await app.inject({ method: "GET", url: "/api/v1/products/not-a-uuid" });
    assert.equal(invalidId.statusCode, 400);
    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/products/10000000-0000-4000-8000-000000009999",
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(errorResponseSchema.parse(missing.json()).error.code, "not_found");
  });

  it("returns products that have no images", async () => {
    const detail = productDetailResponseSchema.parse(await getJson(app, `/api/v1/products/${fixture.plainId}`));
    assert.equal(detail.primaryImage, null);
    assert.deepEqual(detail.images, []);
    assert.equal(detail.brand, null);
  });

  it("keeps the health endpoint available", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "ok");
  });
});

async function getJson(current: Awaited<ReturnType<typeof buildApp>>, url: string): Promise<unknown> {
  const response = await current.inject({ method: "GET", url });
  assert.equal(response.statusCode, 200, `${url} ${response.body}`);
  return response.json();
}

async function insertFixtures(database: Database, fulfilmentId: string): Promise<Fixture> {
  const ids: Fixture = {
    activeCategoryId: randomUUID(),
    inactiveCategoryId: randomUUID(),
    publishedId: randomUUID(),
    draftId: randomUUID(),
    archivedId: randomUUID(),
    inactiveProductId: randomUUID(),
    inactiveCategoryProductId: randomUUID(),
    unavailableId: randomUUID(),
    zeroStockId: randomUUID(),
    plainId: randomUUID(),
    brandId: randomUUID(),
    primaryImageId: randomUUID(),
    secondaryImageId: randomUUID(),
  };
  await database.insert(categories).values([
    {
      id: ids.activeCategoryId,
      name: `Test Active ${suffix}`,
      slug: `test-active-${slugSuffix}`,
      isActive: true,
    },
    {
      id: ids.inactiveCategoryId,
      name: `Test Inactive ${suffix}`,
      slug: `test-inactive-${slugSuffix}`,
      isActive: false,
    },
  ]);
  await database.insert(products).values([
    product(ids.publishedId, ids.activeCategoryId, `Test Published ${suffix}`, "published", true, "Visible Brand"),
    product(ids.draftId, ids.activeCategoryId, `Test Draft ${suffix}`, "draft", true, null),
    product(ids.archivedId, ids.activeCategoryId, `Test Archived ${suffix}`, "archived", true, null),
    product(ids.inactiveProductId, ids.activeCategoryId, `Test Inactive Product ${suffix}`, "published", false, null),
    product(ids.inactiveCategoryProductId, ids.inactiveCategoryId, `Test Hidden Category ${suffix}`, "published", true, null),
    product(ids.unavailableId, ids.activeCategoryId, `Test Unavailable ${suffix}`, "published", true, null),
    product(ids.zeroStockId, ids.activeCategoryId, `Test Empty ${suffix}`, "published", true, null),
    product(ids.plainId, ids.activeCategoryId, `Test Plain ${suffix}`, "published", true, null),
    product(ids.brandId, ids.activeCategoryId, `Test Anonymous ${suffix}`, "published", true, `Zephyr ${suffix}`),
  ]);
  await database.insert(storeProducts).values([
    listing(ids.publishedId, fulfilmentId, 1500, 4, "available"),
    listing(ids.draftId, fulfilmentId, 1500, 4, "available"),
    listing(ids.archivedId, fulfilmentId, 1500, 4, "available"),
    listing(ids.inactiveProductId, fulfilmentId, 1500, 4, "available"),
    listing(ids.inactiveCategoryProductId, fulfilmentId, 1500, 4, "available"),
    listing(ids.unavailableId, fulfilmentId, 1500, 3, "unavailable"),
    listing(ids.zeroStockId, fulfilmentId, 900, 0, "out_of_stock"),
    listing(ids.plainId, fulfilmentId, 700, 2, "available"),
    listing(ids.brandId, fulfilmentId, 800, 2, "available"),
  ]);
  await database.insert(productImages).values([
    {
      id: ids.secondaryImageId,
      productId: ids.publishedId,
      objectKey: `catalog/test/${ids.secondaryImageId}.jpg`,
      deliveryPath: `/catalog/test/${ids.secondaryImageId}.jpg`,
      altText: "Second",
      position: 1,
      isPrimary: false,
    },
    {
      id: ids.primaryImageId,
      productId: ids.publishedId,
      objectKey: `catalog/test/${ids.primaryImageId}.jpg`,
      deliveryPath: `/catalog/test/${ids.primaryImageId}.jpg`,
      altText: "First",
      position: 0,
      isPrimary: true,
    },
  ]);
  return ids;
}

function product(
  id: string,
  categoryId: string,
  name: string,
  publicationStatus: "draft" | "published" | "archived",
  isActive: boolean,
  brand: string | null,
) {
  return {
    id,
    categoryId,
    name,
    brand,
    description: `${name} description`,
    packageLabel: "1 pc",
    publicationStatus,
    isActive,
  };
}

function listing(
  productId: string,
  fulfilmentId: string,
  pricePaise: number,
  stockQuantity: number,
  availability: "available" | "unavailable" | "out_of_stock",
) {
  return {
    storeId: fulfilmentId,
    productId,
    pricePaise,
    stockQuantity,
    availability,
  };
}

async function removeFixtures(database: Database): Promise<void> {
  const rows = await database
    .select({ id: products.id })
    .from(products)
    .where(like(products.name, `Test % ${suffix}`));
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    for (const id of ids) {
      await database.delete(storeProducts).where(eq(storeProducts.productId, id));
    }
    await database.delete(products).where(like(products.name, `Test % ${suffix}`));
  }
  await database.delete(categories).where(like(categories.slug, "test-%"));
}
