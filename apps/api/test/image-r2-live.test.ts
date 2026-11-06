import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  adminSessions,
  categories,
  imageCleanup,
  imageCleanupArchive,
  inventoryMovements,
  openDatabase,
  productImages,
  products,
  storeProducts,
  userRoles,
  users,
  type Database,
} from "@ghartak/database";
import { eq, inArray, like } from "drizzle-orm";
import { Redis } from "ioredis";
import { loadEnv } from "@ghartak/config";
import { buildApp } from "../src/app.js";
import { createAdministrator } from "../src/modules/admin/auth/accounts.js";
import { createImageLifecycle } from "../src/modules/admin/images/image-lifecycle.js";
import { createImageStorage, type ImageStorage } from "../src/modules/admin/images/image-storage.js";
import { createLogger } from "../src/logger.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
const sku = `R2LIVE-${suffix.toUpperCase()}`;
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

let db: Database;
let redis: Redis;
let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let productId = "";
let objectKey = "";
let storage: NonNullable<ReturnType<typeof createImageStorage>>;

describe("controlled live R2 image cycle", () => {
  before(async () => {
    const env = loadEnv();
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET || !env.R2_PUBLIC_BASE_URL) {
      throw new Error("R2 is not fully configured");
    }
    const created = createImageStorage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL,
    });
    if (!created) {
      throw new Error("R2 storage client was not created");
    }
    storage = created;
    const verified = await storage.verify();
    if (verified.httpStatus !== 200) {
      throw new Error("HeadBucket did not return HTTP 200");
    }
    db = openDatabase(env.DATABASE_URL);
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5_000 });
    await cleanup(db);
    await createAdministrator(db, {
      name: "R2 Live Admin",
      email: `r2live-${suffix}@example.com`,
      phone: `+919${suffix.replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`,
      password: "correct-horse-battery",
    });
    app = await buildApp({
      logger: createLogger("silent"),
      db,
      redis,
      auth: {
        sessionTtlSeconds: 60 * 60,
        secureCookies: false,
        loginLimit: 30,
        loginWindowSeconds: 900,
        rateLimitPrefix: `r2live:${suffix}`,
        trustedOrigins: [],
      },
      imageStorage: {
        accountId: env.R2_ACCOUNT_ID,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        bucket: env.R2_BUCKET,
        publicBaseUrl: env.R2_PUBLIC_BASE_URL,
      },
    });
    const session = await app.inject({
      method: "POST",
      url: "/api/v1/admin/session",
      payload: { email: `r2live-${suffix}@example.com`, password: "correct-horse-battery" },
    });
    assert.equal(session.statusCode, 200, session.body);
    const header = session.headers["set-cookie"];
    const raw = Array.isArray(header) ? header[0] : header;
    const match = /ghartak_admin_session=([^;]+)/.exec(raw ?? "");
    assert.ok(match?.[1]);
    token = match[1];
    const category = await app.inject({
      method: "POST",
      url: "/api/v1/admin/categories",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: `R2 Live ${suffix}` },
    });
    assert.equal(category.statusCode, 201, category.body);
    const product = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: `R2 Live ${suffix}`,
        sku,
        categoryId: (category.json() as { id: string }).id,
        unit: "piece",
        packageSize: 1,
        packageLabel: "1 pc",
        publicationStatus: "published",
        pricePaise: 100,
        openingStockQuantity: 1,
        openingReason: "Opening count",
      },
    });
    assert.equal(product.statusCode, 200, product.body);
    productId = (product.json() as { id: string }).id;
  });

  after(async () => {
    if (objectKey) {
      await storage.delete(objectKey).catch(() => undefined);
    }
    if (db) {
      await cleanup(db);
    }
    redis?.disconnect();
    app.server.closeAllConnections?.();
    await app?.close();
  });

  it("uploads one disposable image, serves it, and deletes that same object", async () => {
    const boundary = "----r2live";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="isPrimary"\r\n\r\ntrue\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="probe.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from(jpeg),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/v1/admin/products/${productId}/images`,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "idempotency-key": `r2live-${suffix}`,
      },
      payload: body,
    });
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    const payload = uploaded.json() as { image: { id: string; deliveryPath: string } };
    const imageId = payload.image.id;
    objectKey = payload.image.deliveryPath.replace(/^\//, "");
    const headed = await storage.head(objectKey);
    assert.equal(headed.httpStatus, 200);
    const publicUrl = `${storage.publicBaseUrl}/${objectKey}`;
    const delivered = await fetch(publicUrl);
    assert.equal(delivered.ok, true, `public url ${publicUrl} status ${delivered.status}`);
    const catalogue = await app.inject({ method: "GET", url: `/api/v1/products/${productId}` });
    assert.equal(catalogue.statusCode, 200);
    const catalogueImages = (catalogue.json() as { images: Array<{ id: string; deliveryPath: string }> }).images;
    assert.equal(catalogueImages.some((image) => image.id === imageId), true);

    let deleteAttempts = 0;
    const flaky: ImageStorage = {
      ...storage,
      async delete(key) {
        deleteAttempts += 1;
        if (deleteAttempts === 1) {
          throw new Error("simulated R2 delete failure");
        }
        return storage.delete(key);
      },
    };
    const lifecycle = createImageLifecycle(db, flaky, { skipBucketVerify: true });
    const pending = await lifecycle.enqueueDelete(productId, imageId);
    const first = await lifecycle.processNext();
    assert.equal(first?.status, "pending_delete");
    assert.equal(deleteAttempts, 1);
    assert.equal((await storage.head(objectKey)).httpStatus, 200);
    await db
      .update(imageCleanup)
      .set({ nextRetryAt: null, claimedAt: null, claimToken: null })
      .where(eq(imageCleanup.id, pending.id));
    const retried = await lifecycle.processNext();
    assert.equal(retried?.status, "deleted");
    const gone = await storage.head(objectKey);
    assert.ok(gone.httpStatus === 404 || gone.httpStatus === undefined, `expected missing object, got ${gone.httpStatus}`);
    const after = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, imageId));
    assert.equal(after.length, 0);
    assert.equal(pending.objectKey, objectKey);
    objectKey = "";
  });
});

async function cleanup(database: Database): Promise<void> {
  const productRows = await database.select({ id: products.id }).from(products).where(like(products.sku, "R2LIVE-%"));
  for (const row of productRows) {
    await database.delete(imageCleanup).where(eq(imageCleanup.productId, row.id));
    await database.delete(imageCleanupArchive).where(eq(imageCleanupArchive.productId, row.id));
    await database.delete(productImages).where(eq(productImages.productId, row.id));
    const listings = await database.select({ id: storeProducts.id }).from(storeProducts).where(eq(storeProducts.productId, row.id));
    const listingIds = listings.map((listing) => listing.id);
    if (listingIds.length > 0) {
      await database.delete(inventoryMovements).where(inArray(inventoryMovements.storeProductId, listingIds));
      await database.delete(storeProducts).where(inArray(storeProducts.id, listingIds));
    }
    await database.delete(products).where(eq(products.id, row.id));
  }
  await database.delete(categories).where(like(categories.slug, "%r2-live%"));
  const people = await database.select({ id: users.id }).from(users).where(like(users.email, "r2live-%@example.com"));
  const userIds = people.map((person) => person.id);
  if (userIds.length > 0) {
    await database.delete(adminSessions).where(inArray(adminSessions.userId, userIds));
    await database.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await database.delete(users).where(inArray(users.id, userIds));
  }
}
