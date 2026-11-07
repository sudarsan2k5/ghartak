import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import {
  archiveTerminalImageCleanup,
  canTransitionImageCleanupStatus,
  categories,
  closeDatabase,
  imageCleanup,
  imageCleanupArchive,
  imageCleanupBackoffMs,
  openDatabase,
  productImages,
  products,
  storeProducts,
  stores,
  type Database,
} from "@ghartak/database";
import { and, eq, like, ne } from "drizzle-orm";
import { createImageCleanupWorker } from "../src/modules/admin/images/image-cleanup.worker.js";
import { createImageLifecycle, sanitizeCleanupError } from "../src/modules/admin/images/image-lifecycle.js";
import { createDiskImageStaging } from "../src/modules/admin/images/image-staging.js";
import { createAdminImageService } from "../src/modules/admin/images/image.service.js";
import { assertImageBucketReady, createMemoryImageStorage } from "../src/modules/admin/images/image-storage.js";
import { createCatalogueRepository } from "../src/modules/catalogue/catalogue.repository.js";
import { buildApp } from "../src/app.js";
import { createLogger } from "../src/logger.js";
import type { Redis } from "ioredis";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

function stageDir(): string {
  return mkdtempSync(path.join(tmpdir(), "ghartak-stage-"));
}

function diskStaging(maxBytes?: number) {
  return createDiskImageStaging(stageDir(), maxBytes ? { maxBytes } : undefined);
}

let db: Database;
let productId = "";
let existingImageId = "";
let existingObjectKey = "";

describe("image storage lifecycle", () => {
  before(async () => {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    db = openDatabase(connectionString);
    await cleanup(db);
    const fixture = await insertFixture(db);
    productId = fixture.productId;
    existingImageId = fixture.imageId;
    existingObjectKey = fixture.objectKey;
  });

  afterEach(async () => {
    if (!productId) {
      return;
    }
    await db.delete(imageCleanup).where(eq(imageCleanup.productId, productId));
    await db.delete(productImages).where(and(eq(productImages.productId, productId), ne(productImages.id, existingImageId)));
    const [existing] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, existingImageId));
    if (!existing && existingObjectKey) {
      await db.insert(productImages).values({
        id: existingImageId,
        productId,
        objectKey: existingObjectKey,
        deliveryPath: `/${existingObjectKey}`,
        altText: "Existing",
        position: 0,
        isPrimary: true,
      });
    }
  });

  after(async () => {
    await cleanup(db);
    await closeDatabase();
  });

  it("rejects invalid cleanup status transitions", () => {
    assert.equal(canTransitionImageCleanupStatus("pending_upload", "uploaded"), true);
    assert.equal(canTransitionImageCleanupStatus("pending_upload", "stored"), false);
    assert.equal(canTransitionImageCleanupStatus("stored", "pending_upload"), false);
    assert.equal(canTransitionImageCleanupStatus("pending_delete", "deleted"), true);
    assert.equal(canTransitionImageCleanupStatus("deleted", "pending_delete"), false);
    assert.equal(canTransitionImageCleanupStatus("failed", "pending_upload"), false);
    assert.equal(imageCleanupBackoffMs(1), 1000);
    assert.equal(imageCleanupBackoffMs(5), 16000);
    assert.ok(imageCleanupBackoffMs(20) <= 15 * 60 * 1000);
  });

  it("fails closed when bucket verification does not return HTTP 200", async () => {
    const storage = createMemoryImageStorage({ verifyHttpStatus: 403 });
    await assert.rejects(() => assertImageBucketReady(storage), /bucket verification failed/);
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging() });
    await assert.rejects(
      () =>
        lifecycle.enqueueUpload({
          productId,
          body: jpeg,
          contentType: "image/jpeg",
        }),
      /bucket verification failed/,
    );
  });

  it("uploads through the outbox and only then inserts product_images", async () => {
    const storage = createMemoryImageStorage();
    const staging = diskStaging();
    const lifecycle = createImageLifecycle(db, storage, { staging });
    const pending = await lifecycle.enqueueUpload({
      productId,
      body: jpeg,
      contentType: "image/jpeg",
      altText: "Lifecycle",
      isPrimary: false,
    });
    assert.equal(pending.status, "pending_upload");
    const before = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, pending.imageId));
    assert.equal(before.length, 0);

    const stored = await lifecycle.processNext();
    assert.equal(stored?.status, "stored");
    assert.equal(storage.objects.has(pending.objectKey), true);
    const [visible] = await db.select().from(productImages).where(eq(productImages.id, pending.imageId));
    assert.ok(visible);
    assert.equal(visible.deliveryPath.startsWith("/catalog/"), true);
    assert.equal("objectKey" in (visible as { objectKey?: string }) && visible.objectKey, pending.objectKey);
  });

  it("keeps the outbox pending when R2 upload fails", async () => {
    const storage = createMemoryImageStorage({ putError: "put failed Authorization: secret" });
    const staging = diskStaging();
    const lifecycle = createImageLifecycle(db, storage, { staging });
    const pending = await lifecycle.enqueueUpload({
      productId,
      body: jpeg,
      contentType: "image/jpeg",
    });
    const retried = await lifecycle.processNext();
    assert.equal(retried?.status, "pending_upload");
    assert.equal(storage.objects.size, 0);
    assert.match(retried?.lastError ?? "", /put failed/);
    assert.equal(retried?.lastError?.includes("secret"), false);
    const images = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, pending.imageId));
    assert.equal(images.length, 0);
  });

  it("recovers when PostgreSQL fails after a successful R2 upload", async () => {
    const storage = createMemoryImageStorage();
    const staging = diskStaging();
    let failOnce = true;
    const lifecycle = createImageLifecycle(db, storage, {
      staging,
      hooks: {
        async beforeVisibleInsert() {
          if (failOnce) {
            failOnce = false;
            throw new Error("postgres unavailable");
          }
        },
      },
    });
    const pending = await lifecycle.enqueueUpload({
      productId,
      body: jpeg,
      contentType: "image/jpeg",
    });
    const first = await lifecycle.processNext();
    assert.equal(first?.status, "uploaded");
    assert.equal(storage.objects.has(pending.objectKey), true);
    const missing = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, pending.imageId));
    assert.equal(missing.length, 0);
    await db
      .update(imageCleanup)
      .set({ nextRetryAt: null, claimedAt: null })
      .where(eq(imageCleanup.id, pending.id));

    const stored = await lifecycle.processNext();
    assert.equal(stored?.status, "stored");
    const [visible] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, pending.imageId));
    assert.ok(visible);
  });

  it("abandons a pending upload after process restart with no staged body", async () => {
    const storage = createMemoryImageStorage();
    const staging = diskStaging();
    const lifecycle = createImageLifecycle(db, storage, { staging });
    const pending = await lifecycle.enqueueUpload({
      productId,
      body: jpeg,
      contentType: "image/jpeg",
    });
    await staging.remove(pending.id);
    const recovered = await lifecycle.processNext();
    assert.equal(recovered?.status, "abandoned");
    assert.equal(storage.objects.has(pending.objectKey), false);
    const images = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, pending.imageId));
    assert.equal(images.length, 0);
  });

  it("deletes orphaned objects when staged bytes are gone after restart", async () => {
    const storage = createMemoryImageStorage();
    const staging = diskStaging();
    const lifecycle = createImageLifecycle(db, storage, {
      staging,
      hooks: {
        async afterPut(job) {
          await staging.remove(job.id);
          throw new Error("process restarted");
        },
      },
    });
    const pending = await lifecycle.enqueueUpload({
      productId,
      body: jpeg,
      contentType: "image/jpeg",
    });
    const interrupted = await lifecycle.processNext();
    assert.equal(interrupted?.status, "pending_upload");
    assert.equal(storage.objects.has(pending.objectKey), true);
    await db
      .update(imageCleanup)
      .set({ nextRetryAt: null, claimedAt: null })
      .where(eq(imageCleanup.id, pending.id));

    const recovered = await lifecycle.processNext();
    assert.equal(recovered?.status, "abandoned");
    assert.equal(storage.objects.has(pending.objectKey), false);
    const images = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, pending.imageId));
    assert.equal(images.length, 0);
  });

  it("deletes the R2 object then removes metadata", async () => {
    const storage = createMemoryImageStorage();
    storage.objects.set(existingObjectKey, { body: jpeg, contentType: "image/jpeg" });
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging() });
    const pending = await lifecycle.enqueueDelete(productId, existingImageId);
    assert.equal(pending.status, "pending_delete");
    const hidden = await createCatalogueRepository(db).listImages(productId);
    assert.equal(
      hidden.some((image) => image.id === existingImageId),
      false,
    );
    const [stillThere] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, existingImageId));
    assert.ok(stillThere);

    const deleted = await lifecycle.processNext();
    assert.equal(deleted?.status, "deleted");
    assert.equal(storage.objects.has(existingObjectKey), false);
    const gone = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, existingImageId));
    assert.equal(gone.length, 0);
  });

  it("retries R2 deletion failures with backoff", async () => {
    const storage = createMemoryImageStorage({ deleteError: "delete timeout" });
    const image = await insertExtraImage(db, productId, "retry");
    storage.objects.set(image.objectKey, { body: jpeg, contentType: "image/jpeg" });
    let current = new Date("2026-01-01T00:00:00.000Z");
    const lifecycle = createImageLifecycle(db, storage, {
      staging: diskStaging(),
      now: () => current,
    });
    const pending = await lifecycle.enqueueDelete(productId, image.id);
    await db.update(imageCleanup).set({ maxAttempts: 2 }).where(eq(imageCleanup.id, pending.id));

    const first = await lifecycle.processNext();
    assert.equal(first?.status, "pending_delete");
    assert.ok(first?.nextRetryAt);
    const skipped = await lifecycle.processNext();
    assert.equal(skipped, null);

    current = new Date(current.getTime() + 5 * 60 * 1000);
    const failed = await lifecycle.processNext();
    assert.equal(failed?.status, "failed");
    assert.match(failed?.lastError ?? "", /delete timeout/);
  });

  it("treats a repeated delete as the same pending job", async () => {
    const storage = createMemoryImageStorage();
    const image = await insertExtraImage(db, productId, "repeat");
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging() });
    const first = await lifecycle.enqueueDelete(productId, image.id);
    const second = await lifecycle.enqueueDelete(productId, image.id);
    assert.equal(first.id, second.id);
    assert.equal(second.status, "pending_delete");
  });

  it("treats a missing R2 object as a successful delete", async () => {
    const storage = createMemoryImageStorage();
    const image = await insertExtraImage(db, productId, "missing");
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging() });
    await lifecycle.enqueueDelete(productId, image.id);
    const deleted = await lifecycle.processNext();
    assert.equal(deleted?.status, "deleted");
    assert.equal(storage.deleteCount, 1);
    const gone = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, image.id));
    assert.equal(gone.length, 0);
  });

  it("lets only one worker claim a job", async () => {
    const storage = createMemoryImageStorage({ putDelayMs: 80 });
    const staging = diskStaging();
    const first = createImageCleanupWorker(db, storage, { staging });
    const second = createImageCleanupWorker(db, storage, { staging });
    const pending = await first.enqueueUpload({
      productId,
      body: jpeg,
      contentType: "image/jpeg",
    });
    const [a, b] = await Promise.all([first.processNext(), second.processNext()]);
    const statuses = [a?.status, b?.status].sort();
    assert.deepEqual(statuses, ["stored", undefined]);
    assert.equal(storage.putCount, 1);
    const [visible] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.id, pending.imageId));
    assert.ok(visible);
  });

  it("sanitizes failure details and requires admin authentication for upload", async () => {
    assert.equal(sanitizeCleanupError(new Error("https://example.r2.cloudflarestorage.com token=abc")), "[redacted] [redacted]");
    const app = await buildApp({
      logger: createLogger("silent"),
      db,
      redis: {} as Redis,
      imageStorage: {
        accountId: "acct",
        accessKeyId: "key",
        secretAccessKey: "secret",
        bucket: "bucket",
        publicBaseUrl: "https://images.example",
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/products/${productId}/images`,
    });
    assert.equal(response.statusCode, 401);
    await app.close();
  });

  it("keeps a slow upload when a second worker reaches the old lease window", async () => {
    const storage = createMemoryImageStorage({ putDelayMs: 180 });
    const staging = diskStaging();
    const first = createImageLifecycle(db, storage, { staging, leaseMs: 40, renewEveryMs: 10 });
    const second = createImageLifecycle(db, storage, { staging, leaseMs: 40, renewEveryMs: 10 });
    const pending = await first.enqueueUpload({ productId, body: jpeg, contentType: "image/jpeg" });
    const started = first.processNext();
    await new Promise((resolve) => setTimeout(resolve, 90));
    const other = await second.processNext();
    const stored = await started;
    assert.equal(other, null);
    assert.equal(stored?.status, "stored");
    assert.equal(storage.deleteCount, 0);
    assert.equal(storage.objects.has(pending.objectKey), true);
  });

  it("does not let a stale worker delete the object or change status", async () => {
    const storage = createMemoryImageStorage();
    const staging = diskStaging();
    const lifecycle = createImageLifecycle(db, storage, {
      staging,
      hooks: {
        async onClaimed(job) {
          await staging.remove(job.id);
          await db.update(imageCleanup).set({ claimToken: randomUUID() }).where(eq(imageCleanup.id, job.id));
        },
      },
    });
    const pending = await lifecycle.enqueueUpload({ productId, body: jpeg, contentType: "image/jpeg" });
    const result = await lifecycle.processNext();
    assert.equal(result, null);
    assert.equal(storage.deleteCount, 0);
    const [row] = await db.select({ status: imageCleanup.status }).from(imageCleanup).where(eq(imageCleanup.id, pending.id));
    assert.equal(row?.status, "pending_upload");
  });

  it("finishes an upload from staged bytes after a new worker process starts", async () => {
    const storage = createMemoryImageStorage();
    const directory = stageDir();
    const staging = createDiskImageStaging(directory);
    const writer = createImageLifecycle(db, storage, { staging });
    const pending = await writer.enqueueUpload({ productId, body: jpeg, contentType: "image/jpeg" });
    const reader = createImageLifecycle(db, storage, { staging: createDiskImageStaging(directory) });
    const stored = await reader.processNext();
    assert.equal(stored?.id, pending.id);
    assert.equal(stored?.status, "stored");
    assert.equal(await staging.read(pending.id), undefined);
  });

  it("rejects staging that would exceed the configured byte limit", async () => {
    const storage = createMemoryImageStorage();
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging(3) });
    await assert.rejects(
      () => lifecycle.enqueueUpload({ productId, body: jpeg, contentType: "image/jpeg" }),
      /staging capacity is full/,
    );
  });

  it("reuses an upload job for the same idempotency key and conflicts when the bytes change", async () => {
    const storage = createMemoryImageStorage();
    const staging = diskStaging();
    const lifecycle = createImageLifecycle(db, storage, { staging });
    const first = await lifecycle.enqueueUpload({
      productId,
      body: jpeg,
      contentType: "image/jpeg",
      idempotencyKey: "retry-1",
    });
    await staging.remove(first.id);
    const again = await lifecycle.enqueueUpload({
      productId,
      body: jpeg,
      contentType: "image/jpeg",
      idempotencyKey: "retry-1",
    });
    assert.equal(again.id, first.id);
    assert.ok(await staging.read(first.id));
    await assert.rejects(
      () =>
        lifecycle.enqueueUpload({
          productId,
          body: Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0xd9]),
          contentType: "image/jpeg",
          idempotencyKey: "retry-1",
        }),
      /different image/,
    );
  });

  it("retries a failed deletion and can cancel it so the image is visible again", async () => {
    const storage = createMemoryImageStorage({ deleteError: "delete timeout" });
    const image = await insertExtraImage(db, productId, "failed-delete");
    let current = new Date("2026-02-01T00:00:00.000Z");
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging(), now: () => current });
    const pending = await lifecycle.enqueueDelete(productId, image.id);
    await db.update(imageCleanup).set({ maxAttempts: 1 }).where(eq(imageCleanup.id, pending.id));
    const failed = await lifecycle.processNext();
    assert.equal(failed?.status, "failed");
    assert.equal((await createCatalogueRepository(db).listImages(productId)).some((row) => row.id === image.id), true);

    const retried = await lifecycle.retryFailedDelete(productId, image.id);
    assert.equal(retried.status, "pending_delete");
    assert.equal((await createCatalogueRepository(db).listImages(productId)).some((row) => row.id === image.id), false);
    await lifecycle.cancelFailedDelete(productId, image.id).catch(() => undefined);
    await db
      .update(imageCleanup)
      .set({ status: "failed", completedAt: new Date(), claimToken: null, claimedAt: null })
      .where(eq(imageCleanup.id, pending.id));
    const cancelled = await lifecycle.cancelFailedDelete(productId, image.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal((await createCatalogueRepository(db).listImages(productId)).some((row) => row.id === image.id), true);
    const [kept] = await db.select({ objectKey: imageCleanup.objectKey }).from(imageCleanup).where(eq(imageCleanup.id, pending.id));
    assert.equal(kept?.objectKey, image.objectKey);
  });

  it("rejects metadata changes for an image scheduled for deletion", async () => {
    const storage = createMemoryImageStorage();
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging() });
    const image = await insertExtraImage(db, productId, "locked");
    await lifecycle.enqueueDelete(productId, image.id);
    const images = createAdminImageService(db);
    await assert.rejects(() => images.update(productId, image.id, { altText: "Nope" }), /scheduled for deletion/);
    const listed = await images.reorder(productId, [existingImageId]);
    assert.equal(listed.find((row) => row.id === image.id)?.deletionStatus, "pending_delete");
  });

  it("archives terminal cleanup history so the product row can be removed", async () => {
    const storage = createMemoryImageStorage();
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging() });
    const pending = await lifecycle.enqueueUpload({ productId, body: jpeg, contentType: "image/jpeg" });
    const stored = await lifecycle.processNext();
    assert.equal(stored?.status, "stored");
    const archived = await archiveTerminalImageCleanup(db, productId);
    assert.equal(archived >= 1, true);
    const history = await db.select({ objectKey: imageCleanupArchive.objectKey }).from(imageCleanupArchive).where(eq(imageCleanupArchive.id, pending.id));
    assert.equal(history[0]?.objectKey, pending.objectKey);
    const [live] = await db.select({ id: imageCleanup.id }).from(imageCleanup).where(eq(imageCleanup.id, pending.id));
    assert.equal(live, undefined);
    await assert.rejects(
      () =>
        db.transaction(async (tx) => {
          await tx.delete(imageCleanup).where(eq(imageCleanup.productId, productId));
          await tx.delete(productImages).where(eq(productImages.productId, productId));
          await tx.delete(storeProducts).where(eq(storeProducts.productId, productId));
          await tx.delete(products).where(eq(products.id, productId));
          throw new Error("rolled-back-on-purpose");
        }),
      /rolled-back-on-purpose/,
    );
  });

  it("marks an upload stored when the image row was inserted by a racing worker", async () => {
    const storage = createMemoryImageStorage();
    const staging = diskStaging();
    const lifecycle = createImageLifecycle(db, storage, { staging });
    const pending = await lifecycle.enqueueUpload({ productId, body: jpeg, contentType: "image/jpeg" });
    await db.insert(productImages).values({
      id: pending.imageId,
      productId,
      objectKey: pending.objectKey,
      deliveryPath: `/${pending.objectKey}`,
      position: 2,
      isPrimary: false,
    });
    const stored = await lifecycle.processNext();
    assert.equal(stored?.status, "stored");
    const rows = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.objectKey, pending.objectKey));
    assert.equal(rows.length, 1);
  });

  it("fails the attempt that reaches the configured limit", async () => {
    const storage = createMemoryImageStorage({ putError: "put failed" });
    let current = new Date("2026-03-01T00:00:00.000Z");
    const lifecycle = createImageLifecycle(db, storage, { staging: diskStaging(), now: () => current });
    const pending = await lifecycle.enqueueUpload({ productId, body: jpeg, contentType: "image/jpeg" });
    await db.update(imageCleanup).set({ maxAttempts: 1 }).where(eq(imageCleanup.id, pending.id));
    const failed = await lifecycle.processNext();
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.attemptCount, 1);
  });
});

async function insertFixture(database: Database) {
  const [store] = await database.select({ id: stores.id }).from(stores).limit(1);
  const [category] = await database.select({ id: categories.id }).from(categories).limit(1);
  if (!store || !category) {
    throw new Error("seed catalogue is missing");
  }
  const productIdValue = randomUUID();
  const imageId = randomUUID();
  const objectKey = `catalog/${productIdValue}/${imageId}.jpg`;
  await database.insert(products).values({
    id: productIdValue,
    categoryId: category.id,
    name: `Lifecycle ${suffix}`,
    unit: "piece",
    packageSize: 1,
    packageLabel: "1 pc",
    publicationStatus: "published",
    isActive: true,
  });
  await database.insert(storeProducts).values({
    storeId: store.id,
    productId: productIdValue,
    pricePaise: 100,
    stockQuantity: 1,
    availability: "available",
  });
  await database.insert(productImages).values({
    id: imageId,
    productId: productIdValue,
    objectKey,
    deliveryPath: `/${objectKey}`,
    altText: "Existing",
    position: 0,
    isPrimary: true,
  });
  return { productId: productIdValue, imageId, objectKey };
}

async function insertExtraImage(database: Database, ownerProductId: string, label: string) {
  const id = randomUUID();
  const objectKey = `catalog/${ownerProductId}/${id}.jpg`;
  const siblings = await database
    .select({ position: productImages.position })
    .from(productImages)
    .where(eq(productImages.productId, ownerProductId));
  const position = siblings.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  await database.insert(productImages).values({
    id,
    productId: ownerProductId,
    objectKey,
    deliveryPath: `/${objectKey}`,
    altText: label,
    position,
    isPrimary: false,
  });
  return { id, objectKey };
}

async function cleanup(database: Database): Promise<void> {
  const productRows = await database.select({ id: products.id }).from(products).where(like(products.name, `Lifecycle ${suffix}`));
  const ids = productRows.map((row) => row.id);
  if (ids.length === 0) {
    return;
  }
  for (const id of ids) {
    await database.delete(imageCleanup).where(eq(imageCleanup.productId, id));
    await database.delete(imageCleanupArchive).where(eq(imageCleanupArchive.productId, id));
    await database.delete(productImages).where(eq(productImages.productId, id));
    await database.delete(storeProducts).where(eq(storeProducts.productId, id));
    await database.delete(products).where(eq(products.id, id));
  }
}
