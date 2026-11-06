import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { errorResponseSchema } from "@ghartak/contracts";
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
import { buildApp } from "../src/app.js";
import { createAdministrator } from "../src/modules/admin/auth/accounts.js";
import { detectImageContent, maxImageBytes } from "../src/modules/admin/images/image-policy.js";
import { createMemoryImageStorage } from "../src/modules/admin/images/image-storage.js";
import { createLogger } from "../src/logger.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
const skuPrefix = `IMG-${suffix.toUpperCase()}`;
const password = "correct-horse-battery";
const adminEmail = `img-admin-${suffix}@example.com`;

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x44, 0x41, 0x54,
]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 0x00, 0x00, 0x00, 0x00,
]);
const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");

type ImageList = {
  images: Array<{
    id: string;
    deliveryPath: string;
    altText: string | null;
    position: number;
    isPrimary: boolean;
    deletionStatus?: "pending_delete" | "failed" | null;
  }>;
  image?: { id: string; deliveryPath: string; isPrimary: boolean };
  deletion?: { status: string; imageId: string };
};

let db: Database;
let redis: Redis;
let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let productId = "";
let storageFlags: { putError?: string; deleteError?: string };
let storage: ReturnType<typeof createMemoryImageStorage>;

describe("admin image upload http", () => {
  before(async () => {
    const connectionString = process.env["DATABASE_URL"];
    const redisUrl = process.env["REDIS_URL"];
    if (!connectionString || !redisUrl) {
      throw new Error("DATABASE_URL and REDIS_URL are required");
    }
    process.env["IMAGE_STAGING_DIR"] = mkdtempSync(path.join(tmpdir(), "ghartak-upload-"));
    db = openDatabase(connectionString);
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 5_000 });
    await cleanup(db);
    await createAdministrator(db, {
      name: "Image Admin",
      email: adminEmail,
      phone: `+918${suffix.replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`,
      password,
    });
    storageFlags = {};
    storage = createMemoryImageStorage(storageFlags);
    app = await buildApp({
      logger: createLogger("silent"),
      db,
      redis,
      auth: {
        sessionTtlSeconds: 60 * 60,
        secureCookies: false,
        loginLimit: 30,
        loginWindowSeconds: 900,
        rateLimitPrefix: `img-test:${suffix}`,
        trustedOrigins: [],
      },
      imageStorageClient: storage,
    });
    const session = await app.inject({
      method: "POST",
      url: "/api/v1/admin/session",
      payload: { email: adminEmail, password },
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
      payload: { name: `Images ${suffix}` },
    });
    assert.equal(category.statusCode, 201, category.body);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: `Upload ${suffix}`,
        sku: `${skuPrefix}-ONE`,
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
    assert.equal(created.statusCode, 200, created.body);
    productId = (created.json() as { id: string }).id;
  });

  after(async () => {
    try {
      await cleanup(db);
    } catch (error) {
      console.error("image-upload cleanup failed", error);
    }
    redis.disconnect();
    app.server.closeAllConnections?.();
    await app.close();
  });

  it("accepts JPEG, PNG, and WebP signatures and rejects spoofed or unsupported files", () => {
    assert.equal(detectImageContent(jpeg), "image/jpeg");
    assert.equal(detectImageContent(png), "image/png");
    assert.equal(detectImageContent(webp), "image/webp");
    assert.throws(() => detectImageContent(new Uint8Array([0x00, 0x01, 0x02, 0x03])), /JPEG, PNG, and WebP/);
    assert.throws(() => detectImageContent(gif), /GIF/);
    assert.throws(() => detectImageContent(svg), /SVG/);
    assert.throws(() => detectImageContent(new Uint8Array()), /5 MB/);
    const tooLarge = new Uint8Array(maxImageBytes + 1);
    tooLarge[0] = 0xff;
    tooLarge[1] = 0xd8;
    tooLarge[2] = 0xff;
    assert.throws(() => detectImageContent(tooLarge), /5 MB/);
  });

  it("rejects unauthenticated uploads and missing products", async () => {
    const anonymous = await app.inject({
      method: "POST",
      url: `/api/v1/admin/products/${productId}/images`,
      ...multipart(jpeg, "photo.jpg", "key-anon"),
    });
    assert.equal(anonymous.statusCode, 401);

    const missing = await upload(jpeg, "missing.jpg", "key-missing", { product: randomUUID() });
    assert.equal(missing.statusCode, 404);
    assert.equal(errorResponseSchema.parse(missing.json()).error.message, "Product not found");
  });

  it("rejects invalid signatures, empty files, oversized files, and path-like names", async () => {
    const spoofed = await upload(jpeg, "photo.png", "key-spoof", { contentType: "image/png" });
    assert.equal(spoofed.statusCode, 200, spoofed.body);
    assert.equal((spoofed.json() as ImageList).image?.deliveryPath.endsWith(".jpg"), true);

    const invalid = await upload(gif, "anim.gif", "key-gif");
    assert.equal(invalid.statusCode, 400);
    assert.match(errorResponseSchema.parse(invalid.json()).error.message, /GIF/);

    const empty = await upload(new Uint8Array(), "empty.jpg", "key-empty");
    assert.equal(empty.statusCode, 400);

    const huge = new Uint8Array(maxImageBytes + 1);
    huge.set(jpeg, 0);
    const oversized = await upload(huge, "huge.jpg", "key-huge");
    assert.ok(oversized.statusCode === 400 || oversized.statusCode === 413, oversized.body);

    const traversal = await upload(jpeg, "..secret.jpg", "key-path");
    assert.equal(traversal.statusCode, 400);
  });

  it("stores a valid upload, returns the public delivery path, and keeps one primary image", async () => {
    delete storageFlags.putError;
    const first = await upload(png, "one.png", "key-primary", { altText: "First", isPrimary: true });
    assert.equal(first.statusCode, 200, first.body);
    const firstBody = first.json() as ImageList;
    assert.ok(firstBody.image);
    assert.equal(firstBody.image?.isPrimary, true);
    assert.equal(storage.objects.has(firstBody.image!.deliveryPath.slice(1)), true);
    assert.equal(firstBody.image?.deliveryPath.includes("objectKey"), false);

    const second = await upload(webp, "two.webp", "key-second", { altText: "Second", isPrimary: true });
    assert.equal(second.statusCode, 200, second.body);
    const primaries = (second.json() as ImageList).images.filter((image) => image.isPrimary);
    assert.equal(primaries.length, 1);
    assert.equal(primaries[0]?.id, (second.json() as ImageList).image?.id);
  });

  it("reuses the same idempotency key and payload and rejects a different payload", async () => {
    const key = `reuse-${randomUUID().slice(0, 8)}`;
    const first = await upload(jpeg, "same.jpg", key, { altText: "Same" });
    const second = await upload(jpeg, "same.jpg", key, { altText: "Same" });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal((first.json() as ImageList).image?.id, (second.json() as ImageList).image?.id);

    const conflict = await upload(png, "other.png", key, { altText: "Same" });
    assert.equal(conflict.statusCode, 409);

    const concurrentKey = `race-${randomUUID().slice(0, 8)}`;
    const [left, right] = await Promise.all([
      upload(jpeg, "race.jpg", concurrentKey, { altText: "Race" }),
      upload(jpeg, "race.jpg", concurrentKey, { altText: "Race" }),
    ]);
    assert.equal(left.statusCode, 200, left.body);
    assert.equal(right.statusCode, 200, right.body);
    assert.equal((left.json() as ImageList).image?.id, (right.json() as ImageList).image?.id);
  });

  it("returns 503 when R2 put fails and does not insert metadata", async () => {
    storageFlags.putError = "put failed Authorization: secret";
    const before = await countImages(productId);
    const failed = await upload(jpeg, "fail.jpg", `fail-${randomUUID().slice(0, 8)}`);
    delete storageFlags.putError;
    assert.equal(failed.statusCode, 503);
    assert.equal(errorResponseSchema.parse(failed.json()).error.message.includes("secret"), false);
    assert.equal(await countImages(productId), before);
  });

  it("hides pending deletions from the catalogue and rejects edits until cancel or success", async () => {
    delete storageFlags.deleteError;
    const created = await upload(jpeg, "delete-me.jpg", `del-${randomUUID().slice(0, 8)}`, { altText: "Remove" });
    const imageId = (created.json() as ImageList).image!.id;

    storageFlags.deleteError = "delete failed";
    const pending = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/products/${productId}/images/${imageId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(pending.statusCode, 200, pending.body);
    const pendingBody = pending.json() as ImageList;
    assert.equal(pendingBody.deletion?.status, "pending_delete");
    assert.equal(pendingBody.images.find((image) => image.id === imageId)?.deletionStatus, "pending_delete");

    const catalogue = await app.inject({ method: "GET", url: `/api/v1/products/${productId}` });
    assert.equal(catalogue.statusCode, 200);
    const catalogueImages = (catalogue.json() as { images: Array<{ id: string }> }).images;
    assert.equal(catalogueImages.some((image) => image.id === imageId), false);

    const blocked = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/products/${productId}/images/${imageId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { isPrimary: true },
    });
    assert.equal(blocked.statusCode, 409);

    await db
      .update(imageCleanup)
      .set({ status: "failed", completedAt: new Date(), lastError: "delete failed", claimToken: null, claimedAt: null })
      .where(eq(imageCleanup.imageId, imageId));

    delete storageFlags.deleteError;
    const retried = await app.inject({
      method: "POST",
      url: `/api/v1/admin/products/${productId}/images/${imageId}/deletion/retry`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(retried.statusCode, 200, retried.body);
    assert.equal((retried.json() as ImageList).deletion?.status, "deleted");
    assert.equal(storage.objects.has(`catalog/${productId}/${imageId}.jpg`), false);
  });

  it("cancels a failed deletion and restores catalogue visibility", async () => {
    const created = await upload(jpeg, "keep.jpg", `keep-${randomUUID().slice(0, 8)}`, { altText: "Keep" });
    const imageId = (created.json() as ImageList).image!.id;
    storageFlags.deleteError = "delete failed";
    await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/products/${productId}/images/${imageId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    await db
      .update(imageCleanup)
      .set({ status: "failed", completedAt: new Date(), lastError: "delete failed", claimToken: null, claimedAt: null })
      .where(eq(imageCleanup.imageId, imageId));
    delete storageFlags.deleteError;
    const cancelled = await app.inject({
      method: "POST",
      url: `/api/v1/admin/products/${productId}/images/${imageId}/deletion/cancel`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    assert.equal((cancelled.json() as ImageList).deletion?.status, "cancelled");
    const catalogue = await app.inject({ method: "GET", url: `/api/v1/products/${productId}` });
    const catalogueImages = (catalogue.json() as { images: Array<{ id: string }> }).images;
    assert.equal(catalogueImages.some((image) => image.id === imageId), true);
  });
});

function multipart(
  body: Uint8Array,
  filename: string,
  key: string,
  options?: { altText?: string; isPrimary?: boolean; contentType?: string },
) {
  const boundary = `----ghartak${randomUUID().replaceAll("-", "")}`;
  const chunks: Buffer[] = [];
  const field = (name: string, value: string) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  };
  if (options?.altText) {
    field("altText", options.altText);
  }
  field("isPrimary", options?.isPrimary ? "true" : "false");
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${options?.contentType ?? "application/octet-stream"}\r\n\r\n`,
    ),
  );
  chunks.push(Buffer.from(body));
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "idempotency-key": key,
    },
    payload: Buffer.concat(chunks),
  };
}

function upload(
  body: Uint8Array,
  filename: string,
  key: string,
  options?: { altText?: string; isPrimary?: boolean; contentType?: string; product?: string },
) {
  const form = multipart(body, filename, key, options);
  return app.inject({
    method: "POST",
    url: `/api/v1/admin/products/${options?.product ?? productId}/images`,
    headers: { authorization: `Bearer ${token}`, ...form.headers },
    payload: form.payload,
  });
}

async function countImages(owner: string) {
  const rows = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, owner));
  return rows.length;
}

async function cleanup(database: Database): Promise<void> {
  const productRows = await database.select({ id: products.id }).from(products).where(like(products.sku, `${skuPrefix}-%`));
  const ids = productRows.map((row) => row.id);
  for (const id of ids) {
    await database.delete(imageCleanup).where(eq(imageCleanup.productId, id));
    await database.delete(imageCleanupArchive).where(eq(imageCleanupArchive.productId, id));
    await database.delete(productImages).where(eq(productImages.productId, id));
    const listings = await database.select({ id: storeProducts.id }).from(storeProducts).where(eq(storeProducts.productId, id));
    const listingIds = listings.map((listing) => listing.id);
    if (listingIds.length > 0) {
      await database.delete(inventoryMovements).where(inArray(inventoryMovements.storeProductId, listingIds));
      await database.delete(storeProducts).where(inArray(storeProducts.id, listingIds));
    }
    await database.delete(products).where(eq(products.id, id));
  }
  await database.delete(categories).where(like(categories.slug, `%${suffix}%`));
  const people = await database.select({ id: users.id }).from(users).where(like(users.email, `%${suffix}@example.com`));
  const userIds = people.map((person) => person.id);
  if (userIds.length > 0) {
    await database.delete(adminSessions).where(inArray(adminSessions.userId, userIds));
    await database.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await database.delete(users).where(inArray(users.id, userIds));
  }
}
