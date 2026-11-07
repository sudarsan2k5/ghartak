import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { adminCategoryListResponseSchema, adminDailyTileListResponseSchema, adminDailyTileSchema, adminCategorySchema, dailyTileListResponseSchema } from "@ghartak/contracts";
import { adminSessions, categories, homeDailyTiles, inventoryMovements, openDatabase, products, storeProducts, userRoles, users, type Database } from "@ghartak/database";
import { eq, inArray, like } from "drizzle-orm";
import { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import { createAdministrator } from "../src/modules/admin/auth/accounts.js";
import { createMemoryImageStorage } from "../src/modules/admin/images/image-storage.js";
import { createLogger } from "../src/logger.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
const password = "correct-horse-battery";
const adminEmail = `tile-admin-${suffix}@example.com`;
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

let db: Database;
let redis: Redis;
let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let storage: ReturnType<typeof createMemoryImageStorage>;
let original: Array<typeof homeDailyTiles.$inferSelect> = [];
const createdProductIds: string[] = [];

function authed() {
  return { authorization: `Bearer ${token}` };
}

function multipart(body: Uint8Array) {
  const boundary = `----ghartak${suffix}`;
  return {
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      Buffer.from(body),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { ...authed(), "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function publicTile(position: number) {
  const response = await app.inject({ method: "GET", url: "/api/v1/home/daily-tiles" });
  assert.equal(response.statusCode, 200, response.body);
  const { tiles } = dailyTileListResponseSchema.parse(response.json());
  assert.deepEqual(tiles.map((tile) => tile.position), [1, 2, 3, 4]);
  return tiles[position - 1]!;
}

describe("daily tiles and category images", () => {
  before(async () => {
    db = openDatabase(process.env["DATABASE_URL"]!);
    redis = new Redis(process.env["REDIS_URL"]!, { maxRetriesPerRequest: 1, connectTimeout: 5_000 });
    original = await db.select().from(homeDailyTiles);
    await createAdministrator(db, {
      name: "Tile Admin",
      email: adminEmail,
      phone: `+917${suffix.replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`,
      password,
    });
    storage = createMemoryImageStorage();
    app = await buildApp({
      logger: createLogger("silent"),
      db,
      redis,
      auth: {
        sessionTtlSeconds: 3600,
        secureCookies: false,
        loginLimit: 30,
        loginWindowSeconds: 900,
        rateLimitPrefix: `tile-test:${suffix}`,
        trustedOrigins: [],
      },
      imageStorageClient: storage,
    });
    const session = await app.inject({ method: "POST", url: "/api/v1/admin/session", payload: { email: adminEmail, password } });
    assert.equal(session.statusCode, 200, session.body);
    const header = session.headers["set-cookie"];
    const match = /ghartak_admin_session=([^;]+)/.exec((Array.isArray(header) ? header[0] : header) ?? "");
    assert.ok(match?.[1]);
    token = match[1];
  });

  after(async () => {
    for (const row of original) {
      await db.update(homeDailyTiles).set(row).where(eq(homeDailyTiles.position, row.position));
    }
    if (createdProductIds.length > 0) {
      const listings = await db.select({ id: storeProducts.id }).from(storeProducts).where(inArray(storeProducts.productId, createdProductIds));
      await db.delete(inventoryMovements).where(inArray(inventoryMovements.storeProductId, listings.map((row) => row.id)));
      await db.delete(storeProducts).where(inArray(storeProducts.productId, createdProductIds));
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    await db.delete(categories).where(like(categories.slug, `tile-${suffix}%`));
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail));
    if (admin) {
      await db.delete(adminSessions).where(eq(adminSessions.userId, admin.id));
      await db.delete(userRoles).where(eq(userRoles.userId, admin.id));
      await db.delete(users).where(eq(users.id, admin.id));
    }
    redis.disconnect();
    app.server.closeAllConnections?.();
    await app.close();
  });

  it("requires an admin and rejects positions outside the four boxes", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/v1/admin/daily-tiles" });
    assert.equal(anonymous.statusCode, 401);
    const outside = await app.inject({ method: "PATCH", url: "/api/v1/admin/daily-tiles/5", headers: authed(), payload: { label: "No" } });
    assert.equal(outside.statusCode, 400);
    const listed = await app.inject({ method: "GET", url: "/api/v1/admin/daily-tiles", headers: authed() });
    assert.equal(adminDailyTileListResponseSchema.parse(listed.json()).tiles.length, 4);
  });

  it("changes the text, category link, and image customers see", async () => {
    const category = adminCategorySchema.parse(
      (await app.inject({ method: "POST", url: "/api/v1/admin/categories", headers: authed(), payload: { name: "Tile cat", slug: `tile-${suffix}` } })).json(),
    );
    const patched = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/daily-tiles/3",
      headers: authed(),
      payload: { label: "Cooking", categoryId: category.id },
    });
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(adminDailyTileSchema.parse(patched.json()).categoryName, "Tile cat");

    const first = await app.inject({ method: "POST", url: "/api/v1/admin/daily-tiles/3/image", ...multipart(jpeg) });
    assert.equal(first.statusCode, 200, first.body);
    const firstPath = adminDailyTileSchema.parse(first.json()).imageDeliveryPath!;
    assert.match(firstPath, /^\/display\/daily-tiles\/3\/.+\.jpg$/);
    assert.equal(storage.objects.has(firstPath.slice(1)), true);

    const replaced = await app.inject({ method: "POST", url: "/api/v1/admin/daily-tiles/3/image", ...multipart(jpeg) });
    const secondPath = adminDailyTileSchema.parse(replaced.json()).imageDeliveryPath!;
    assert.equal(storage.objects.has(firstPath.slice(1)), false);

    assert.deepEqual(await publicTile(3), { position: 3, label: "Cooking", imageDeliveryPath: secondPath, categoryId: category.id });

    await app.inject({ method: "PATCH", url: `/api/v1/admin/categories/${category.id}`, headers: authed(), payload: { isActive: false } });
    assert.equal((await publicTile(3)).categoryId, null);

    const removed = await app.inject({ method: "DELETE", url: "/api/v1/admin/daily-tiles/3/image", headers: authed() });
    assert.equal(adminDailyTileSchema.parse(removed.json()).imageDeliveryPath, null);
    assert.equal(storage.objects.has(secondPath.slice(1)), false);

    const deleted = await app.inject({ method: "DELETE", url: `/api/v1/admin/categories/${category.id}`, headers: authed() });
    assert.equal(deleted.statusCode, 204);
    const after = await app.inject({ method: "GET", url: "/api/v1/admin/daily-tiles", headers: authed() });
    assert.equal(adminDailyTileListResponseSchema.parse(after.json()).tiles[2]?.categoryId, null);
  });

  it("uploads, replaces, and removes a category front image", async () => {
    const category = adminCategorySchema.parse(
      (await app.inject({ method: "POST", url: "/api/v1/admin/categories", headers: authed(), payload: { name: "Pic cat", slug: `tile-${suffix}-pic` } })).json(),
    );
    assert.equal(category.imageDeliveryPath, null);

    const bad = await app.inject({ method: "POST", url: `/api/v1/admin/categories/${category.id}/image`, ...multipart(gif) });
    assert.equal(bad.statusCode, 400);
    const missing = await app.inject({ method: "POST", url: `/api/v1/admin/categories/${randomUUID()}/image`, ...multipart(jpeg) });
    assert.equal(missing.statusCode, 404);

    const uploaded = await app.inject({ method: "POST", url: `/api/v1/admin/categories/${category.id}/image`, ...multipart(jpeg) });
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    const path = adminCategorySchema.parse(uploaded.json()).imageDeliveryPath!;
    assert.equal(storage.objects.has(path.slice(1)), true);

    const list = (await app.inject({ method: "GET", url: "/api/v1/categories" })).json() as { categories: Array<{ id: string; imageDeliveryPath: string | null }> };
    assert.equal(list.categories.find((row) => row.id === category.id)?.imageDeliveryPath, path);

    const removed = await app.inject({ method: "DELETE", url: `/api/v1/admin/categories/${category.id}/image`, headers: authed() });
    assert.equal(adminCategorySchema.parse(removed.json()).imageDeliveryPath, null);
    assert.equal(storage.objects.has(path.slice(1)), false);
  });

  it("keeps products inside their category and shows only live ones to customers", async () => {
    const create = async (name: string) =>
      adminCategorySchema.parse(
        (await app.inject({ method: "POST", url: "/api/v1/admin/categories", headers: authed(), payload: { name, slug: `tile-${suffix}-${name.toLowerCase()}` } })).json(),
      );
    const vegetables = await create("Vegetables");
    const snacks = await create("Snacks");
    const addProduct = async (name: string, categoryId: string, extra: Record<string, unknown>) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/admin/products",
        headers: authed(),
        payload: {
          name,
          categoryId,
          unit: "kg",
          packageSize: 1,
          packageLabel: "1 kg",
          pricePaise: 8000,
          openingStockQuantity: 5,
          openingReason: "Opening stock",
          ...extra,
        },
      });
      assert.equal(response.statusCode, 200, response.body);
      return response.json() as { id: string };
    };
    const tomato = await addProduct("Tomato", vegetables.id, { publicationStatus: "published", mrpPaise: 10000 });
    const draft = await addProduct("Potato", vegetables.id, {});
    const chips = await addProduct("Chips", snacks.id, { publicationStatus: "published" });
    createdProductIds.push(tomato.id, draft.id, chips.id);

    const customerList = async (categoryId: string) =>
      (await app.inject({ method: "GET", url: `/api/v1/products?categoryId=${categoryId}&limit=50` })).json() as {
        products: Array<{ id: string; name: string; mrpPaise: number | null; pricePaise: number }>;
      };
    const vegetableList = await customerList(vegetables.id);
    assert.deepEqual(vegetableList.products.map((product) => product.name), ["Tomato"]);
    assert.equal(vegetableList.products[0]?.mrpPaise, 10000);
    assert.deepEqual((await customerList(snacks.id)).products.map((product) => product.name), ["Chips"]);

    const published = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/products/${draft.id}`,
      headers: authed(),
      payload: { publicationStatus: "published", isActive: true },
    });
    assert.equal(published.statusCode, 200, published.body);
    assert.equal((await customerList(vegetables.id)).products.length, 2);

    const archived = await app.inject({ method: "DELETE", url: `/api/v1/admin/products/${draft.id}`, headers: authed() });
    assert.equal(archived.statusCode, 200, archived.body);
    const restored = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/products/${draft.id}`,
      headers: authed(),
      payload: { publicationStatus: "published", isActive: true },
    });
    assert.equal(restored.statusCode, 200, restored.body);

    const lowMrp = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/products/${tomato.id}/price`,
      headers: authed(),
      payload: { pricePaise: 9000, mrpPaise: 8000 },
    });
    assert.equal(lowMrp.statusCode, 400);
    const noDiscount = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/products/${tomato.id}/price`,
      headers: authed(),
      payload: { pricePaise: 12000 },
    });
    assert.equal(noDiscount.statusCode, 200, noDiscount.body);
    assert.equal((await customerList(vegetables.id)).products.find((product) => product.id === tomato.id)?.mrpPaise, null);

    const adminList = (await app.inject({ method: "GET", url: `/api/v1/admin/products?categoryId=${vegetables.id}`, headers: authed() })).json() as {
      products: Array<{ name: string }>;
    };
    assert.equal(adminList.products.some((product) => product.name === "Chips"), false);

    const blocked = await app.inject({ method: "DELETE", url: `/api/v1/admin/categories/${vegetables.id}`, headers: authed() });
    assert.equal(blocked.statusCode, 409);
    assert.equal((await customerList(vegetables.id)).products.length, 2);

    await app.inject({ method: "PATCH", url: `/api/v1/admin/categories/${snacks.id}`, headers: authed(), payload: { isActive: false } });
    assert.deepEqual((await customerList(snacks.id)).products, []);
    const visible = (await app.inject({ method: "GET", url: "/api/v1/categories" })).json() as { categories: Array<{ id: string }> };
    assert.equal(visible.categories.some((row) => row.id === snacks.id), false);
  });

  it("saves the category order customers see and rejects a stale list", async () => {
    const listed = adminCategoryListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/v1/admin/categories", headers: authed() })).json());
    const ids = listed.categories.map((category) => category.id);
    const reversed = [...ids].reverse();
    const saved = await app.inject({ method: "PUT", url: "/api/v1/admin/categories/order", headers: authed(), payload: { categoryIds: reversed } });
    assert.equal(saved.statusCode, 200, saved.body);
    const active = listed.categories.filter((category) => category.isActive).map((category) => category.id);
    const customer = (await app.inject({ method: "GET", url: "/api/v1/categories" })).json() as { categories: Array<{ id: string }> };
    assert.deepEqual(customer.categories.map((category) => category.id), reversed.filter((id) => active.includes(id)));

    const stale = await app.inject({ method: "PUT", url: "/api/v1/admin/categories/order", headers: authed(), payload: { categoryIds: reversed.slice(1) } });
    assert.equal(stale.statusCode, 409);
    await app.inject({ method: "PUT", url: "/api/v1/admin/categories/order", headers: authed(), payload: { categoryIds: ids } });
  });
});
