import { randomUUID } from "node:crypto";
import type { ImageCleanupStatus } from "@ghartak/contracts";
import {
  assertImageCleanupTransition,
  imageCleanup,
  imageCleanupBackoffMs,
  productImages,
  products,
  withTransaction,
  type Database,
} from "@ghartak/database";
import { and, desc, eq, sql } from "drizzle-orm";
import { HttpError, isUniqueViolation } from "../../../http/errors.js";
import {
  assertImageUpload,
  catalogueDeliveryPath,
  catalogueObjectKey,
  type ImageContentType,
} from "./image-policy.js";
import { createDiskImageStaging, uploadPayloadHash, type ImageUploadStaging } from "./image-staging.js";
import { assertImageBucketReady, type ImageStorage } from "./image-storage.js";
import { tmpdir } from "node:os";
import path from "node:path";

const defaultLeaseMs = 2 * 60 * 1000;
const defaultRenewMs = 15 * 1000;
const defaultMaxAttempts = 8;

export class LeaseLostError extends Error {
  constructor() {
    super("image cleanup lease was lost");
    this.name = "LeaseLostError";
  }
}

export type ImageCleanupJob = typeof imageCleanup.$inferSelect;

export type ImageLifecycleHooks = {
  onClaimed?: (job: ImageCleanupJob) => Promise<void>;
  afterPut?: (job: ImageCleanupJob) => Promise<void>;
  beforeVisibleInsert?: () => Promise<void>;
};

export type ImageLifecycle = {
  enqueueUpload(input: {
    productId: string;
    body: Uint8Array;
    contentType: string;
    altText?: string | null;
    isPrimary?: boolean;
    idempotencyKey?: string;
  }): Promise<ImageCleanupJob>;
  enqueueDelete(productId: string, imageId: string): Promise<ImageCleanupJob>;
  retryFailedDelete(productId: string, imageId: string): Promise<ImageCleanupJob>;
  cancelFailedDelete(productId: string, imageId: string): Promise<ImageCleanupJob>;
  processNext(): Promise<ImageCleanupJob | null>;
  processDue(limit?: number): Promise<ImageCleanupJob[]>;
  settle(jobId: string): Promise<ImageCleanupJob>;
};

export function createImageLifecycle(
  db: Database,
  storage: ImageStorage,
  options?: {
    staging?: ImageUploadStaging;
    hooks?: ImageLifecycleHooks;
    now?: () => Date;
    leaseMs?: number;
    renewEveryMs?: number;
    skipBucketVerify?: boolean;
  },
): ImageLifecycle {
  const staging =
    options?.staging ??
    createDiskImageStaging(process.env["IMAGE_STAGING_DIR"] ?? path.join(tmpdir(), "ghartak-image-staging"));
  const now = options?.now ?? (() => new Date());
  const leaseMs = options?.leaseMs ?? defaultLeaseMs;
  const renewEveryMs = options?.renewEveryMs ?? defaultRenewMs;

  return {
    async enqueueUpload(input) {
      await ensureBucket(storage, options?.skipBucketVerify);
      const contentType = assertImageUpload({
        contentType: input.contentType,
        byteLength: input.body.byteLength,
      });
      const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, input.productId)).limit(1);
      if (!product) {
        throw new HttpError(404, "Product not found");
      }
      const altText = input.altText ?? null;
      const isPrimary = input.isPrimary ?? false;
      const payloadHash = uploadPayloadHash({ body: input.body, contentType, altText, isPrimary });
      if (input.idempotencyKey) {
        const existing = await findIdempotentUpload(db, input.productId, input.idempotencyKey);
        if (existing) {
          if (existing.payloadHash !== payloadHash) {
            throw new HttpError(409, "This upload key was already used with a different image");
          }
          if (existing.status === "pending_upload" && !(await staging.read(existing.id))) {
            await staging.write(existing.id, input.body);
          }
          return existing;
        }
      }
      const jobId = randomUUID();
      const imageId = randomUUID();
      const objectKey = catalogueObjectKey(input.productId, imageId, contentType);
      await staging.write(jobId, input.body);
      try {
        const [job] = await db
          .insert(imageCleanup)
          .values({
            id: jobId,
            operation: "upload",
            status: "pending_upload",
            productId: input.productId,
            imageId,
            objectKey,
            contentType,
            byteLength: input.body.byteLength,
            altText,
            isPrimary,
            idempotencyKey: input.idempotencyKey ?? null,
            payloadHash,
          })
          .returning();
        if (!job) {
          throw new Error("image cleanup job was not recorded");
        }
        return job;
      } catch (error) {
        if (input.idempotencyKey && isUniqueViolation(error)) {
          await staging.remove(jobId);
          const existing = await findIdempotentUpload(db, input.productId, input.idempotencyKey);
          if (!existing) {
            throw error;
          }
          if (existing.payloadHash !== payloadHash) {
            throw new HttpError(409, "This upload key was already used with a different image");
          }
          if (existing.status === "pending_upload" && !(await staging.read(existing.id))) {
            await staging.write(existing.id, input.body);
          }
          return existing;
        }
        await staging.remove(jobId);
        throw error;
      }
    },

    async enqueueDelete(productId, imageId) {
      await ensureBucket(storage, options?.skipBucketVerify);
      const [existing] = await db
        .select()
        .from(imageCleanup)
        .where(and(eq(imageCleanup.imageId, imageId), eq(imageCleanup.status, "pending_delete")))
        .limit(1);
      if (existing) {
        return existing;
      }
      const [image] = await db
        .select({
          id: productImages.id,
          productId: productImages.productId,
          objectKey: productImages.objectKey,
        })
        .from(productImages)
        .where(eq(productImages.id, imageId))
        .limit(1);
      if (!image || image.productId !== productId) {
        const [finished] = await db
          .select()
          .from(imageCleanup)
          .where(and(eq(imageCleanup.imageId, imageId), eq(imageCleanup.status, "deleted")))
          .limit(1);
        if (finished) {
          return finished;
        }
        throw new HttpError(404, "Image not found");
      }
      try {
        const [job] = await db
          .insert(imageCleanup)
          .values({
            operation: "delete",
            status: "pending_delete",
            productId,
            imageId,
            objectKey: image.objectKey,
          })
          .returning();
        if (!job) {
          throw new Error("image cleanup job was not recorded");
        }
        return job;
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        const [duplicate] = await db
          .select()
          .from(imageCleanup)
          .where(and(eq(imageCleanup.imageId, imageId), eq(imageCleanup.status, "pending_delete")))
          .limit(1);
        if (!duplicate) {
          throw error;
        }
        return duplicate;
      }
    },

    async retryFailedDelete(productId, imageId) {
      return recoverFailedDelete(db, productId, imageId, "pending_delete");
    },

    async cancelFailedDelete(productId, imageId) {
      return recoverFailedDelete(db, productId, imageId, "cancelled");
    },

    async processNext() {
      await ensureBucket(storage, options?.skipBucketVerify);
      const claimed = await claimJob(db, now(), leaseMs);
      return runClaimed(claimed);
    },

    async processDue(limit = 25) {
      const processed: ImageCleanupJob[] = [];
      for (let index = 0; index < limit; index += 1) {
        const job = await this.processNext();
        if (!job) {
          break;
        }
        processed.push(job);
      }
      return processed;
    },

    async settle(jobId) {
      for (let index = 0; index < 32; index += 1) {
        const current = await loadJob(db, jobId);
        if (isTerminalCleanupStatus(current.status)) {
          return current;
        }
        const retryLater = Boolean(current.nextRetryAt && current.nextRetryAt.getTime() > now().getTime());
        const leaseValid = Boolean(current.claimedAt && now().getTime() - current.claimedAt.getTime() < leaseMs);
        if (retryLater && !leaseValid) {
          return current;
        }
        await ensureBucket(storage, options?.skipBucketVerify);
        const claimed = await claimJob(db, now(), leaseMs, jobId);
        const processed = await runClaimed(claimed);
        if (processed && processed.id === jobId && isTerminalCleanupStatus(processed.status)) {
          return processed;
        }
        if (!claimed) {
          await wait(20);
        }
      }
      return loadJob(db, jobId);
    },
  };

  async function runClaimed(claimed: ImageCleanupJob | null) {
    if (!claimed) {
      return null;
    }
    try {
      if (options?.hooks?.onClaimed) {
        await options.hooks.onClaimed(claimed);
      }
      if (claimed.attemptCount > claimed.maxAttempts) {
        return await failJob(db, claimed, "retry budget exhausted");
      }
      if (claimed.operation === "upload") {
        return await processUpload(db, storage, staging, claimed, options?.hooks, now, renewEveryMs);
      }
      return await processDelete(db, storage, claimed, now, renewEveryMs);
    } catch (error) {
      if (error instanceof LeaseLostError) {
        return null;
      }
      return scheduleRetryOrFail(db, claimed, error, now());
    }
  }
}

async function loadJob(db: Database, jobId: string): Promise<ImageCleanupJob> {
  const [job] = await db.select().from(imageCleanup).where(eq(imageCleanup.id, jobId)).limit(1);
  if (!job) {
    throw new Error("image cleanup job was not found");
  }
  return job;
}

async function ensureBucket(storage: ImageStorage, skip?: boolean): Promise<void> {
  if (skip) {
    return;
  }
  await assertImageBucketReady(storage);
}

async function findIdempotentUpload(db: Database, productId: string, idempotencyKey: string) {
  const [existing] = await db
    .select()
    .from(imageCleanup)
    .where(and(eq(imageCleanup.productId, productId), eq(imageCleanup.idempotencyKey, idempotencyKey)))
    .limit(1);
  return existing ?? null;
}

function isTerminalCleanupStatus(status: string): boolean {
  return status === "stored" || status === "deleted" || status === "failed" || status === "abandoned" || status === "cancelled";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function claimJob(db: Database, at: Date, leaseMs: number, jobId?: string): Promise<ImageCleanupJob | null> {
  const staleBefore = new Date(at.getTime() - leaseMs);
  const claimToken = randomUUID();
  return withTransaction(db, async (tx) => {
    const result = await tx.execute(sql`
      select id
      from image_cleanup
      where status in ('pending_upload', 'uploaded', 'pending_delete')
        and (next_retry_at is null or next_retry_at <= ${at.toISOString()}::timestamptz)
        and (claimed_at is null or claimed_at < ${staleBefore.toISOString()}::timestamptz)
        and completed_at is null
        ${jobId ? sql`and id = ${jobId}::uuid` : sql``}
      order by created_at, id
      for update skip locked
      limit 1
    `);
    const claimedId = firstId(result);
    if (!claimedId) {
      return null;
    }
    const [updated] = await tx
      .update(imageCleanup)
      .set({
        claimedAt: at,
        claimToken,
        attemptCount: sql`${imageCleanup.attemptCount} + 1`,
        updatedAt: at,
      })
      .where(eq(imageCleanup.id, claimedId))
      .returning();
    return updated ?? null;
  });
}

async function processUpload(
  db: Database,
  storage: ImageStorage,
  staging: ImageUploadStaging,
  job: ImageCleanupJob,
  hooks: ImageLifecycleHooks | undefined,
  now: () => Date,
  renewEveryMs: number,
): Promise<ImageCleanupJob> {
  if (job.status === "pending_upload") {
    const body = await staging.read(job.id);
    if (!body) {
      const abandoned = await compareAndSwap(db, job, "abandoned", "staged upload body is missing");
      if (!abandoned) {
        throw new LeaseLostError();
      }
      await storage.delete(job.objectKey);
      return abandoned;
    }
    if (!job.contentType) {
      await staging.remove(job.id);
      return failJob(db, job, "upload job is missing a content type");
    }
    await withLease(db, job, renewEveryMs, now, async () => {
      await storage.put({ objectKey: job.objectKey, body, contentType: job.contentType ?? "application/octet-stream" });
    });
    if (hooks?.afterPut) {
      await hooks.afterPut(job);
    }
    const uploaded = await compareAndSwap(db, job, "uploaded", null);
    if (!uploaded) {
      throw new LeaseLostError();
    }
    await staging.remove(job.id);
    return storeVisibleImage(db, uploaded, hooks);
  }
  if (job.status === "uploaded") {
    return storeVisibleImage(db, job, hooks);
  }
  throw new Error(`unexpected upload job status: ${job.status}`);
}

async function storeVisibleImage(
  db: Database,
  job: ImageCleanupJob,
  hooks?: ImageLifecycleHooks,
): Promise<ImageCleanupJob> {
  if (!job.contentType) {
    return failJob(db, job, "upload job is missing a content type");
  }
  const contentType = job.contentType as ImageContentType;
  try {
    return await withTransaction(db, async (tx) => {
      if (hooks?.beforeVisibleInsert) {
        await hooks.beforeVisibleInsert();
      }
      const [existing] = await tx
        .select({ id: productImages.id, objectKey: productImages.objectKey })
        .from(productImages)
        .where(eq(productImages.id, job.imageId))
        .limit(1);
      if (!existing) {
        const siblings = await tx
          .select({ position: productImages.position })
          .from(productImages)
          .where(eq(productImages.productId, job.productId))
          .orderBy(desc(productImages.position));
        const nextPosition = job.position ?? (siblings[0] ? siblings[0].position + 1 : 0);
        const isPrimary = job.isPrimary || siblings.length === 0;
        if (isPrimary) {
          await tx.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, job.productId));
        }
        await tx.insert(productImages).values({
          id: job.imageId,
          productId: job.productId,
          objectKey: job.objectKey,
          deliveryPath: catalogueDeliveryPath(job.productId, job.imageId, contentType),
          altText: job.altText,
          position: nextPosition,
          isPrimary,
        });
      }
      return markStored(tx, job);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const [sameImage] = await db
      .select({ id: productImages.id, objectKey: productImages.objectKey })
      .from(productImages)
      .where(eq(productImages.id, job.imageId))
      .limit(1);
    if (sameImage?.objectKey === job.objectKey) {
      return markStored(db, job);
    }
    return failJob(db, job, "image metadata conflicted with an existing row");
  }
}

async function markStored(
  db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  job: ImageCleanupJob,
): Promise<ImageCleanupJob> {
  assertImageCleanupTransition(job.status, "stored");
  const [updated] = await db
    .update(imageCleanup)
    .set({
      status: "stored",
      completedAt: new Date(),
      lastError: null,
      nextRetryAt: null,
      claimedAt: null,
      claimToken: null,
      updatedAt: new Date(),
    })
    .where(and(eq(imageCleanup.id, job.id), eq(imageCleanup.claimToken, job.claimToken ?? ""), eq(imageCleanup.status, job.status)))
    .returning();
  if (!updated) {
    throw new LeaseLostError();
  }
  return updated;
}

async function processDelete(
  db: Database,
  storage: ImageStorage,
  job: ImageCleanupJob,
  now: () => Date,
  renewEveryMs: number,
): Promise<ImageCleanupJob> {
  await withLease(db, job, renewEveryMs, now, async () => {
    await storage.delete(job.objectKey);
  });
  return withTransaction(db, async (tx) => {
    await tx.delete(productImages).where(eq(productImages.id, job.imageId));
    const updated = await compareAndSwap(tx, job, "deleted", null);
    if (!updated) {
      throw new LeaseLostError();
    }
    return updated;
  });
}

async function recoverFailedDelete(
  db: Database,
  productId: string,
  imageId: string,
  status: "pending_delete" | "cancelled",
): Promise<ImageCleanupJob> {
  const [job] = await db
    .select()
    .from(imageCleanup)
    .where(and(eq(imageCleanup.productId, productId), eq(imageCleanup.imageId, imageId), eq(imageCleanup.operation, "delete")))
    .orderBy(desc(imageCleanup.createdAt))
    .limit(1);
  if (!job) {
    throw new HttpError(404, "Image deletion was not found");
  }
  if (job.status === status) {
    return job;
  }
  if (job.status !== "failed") {
    throw new HttpError(409, "Only a failed image deletion can be retried or cancelled");
  }
  assertImageCleanupTransition(job.status, status);
  const [updated] = await db
    .update(imageCleanup)
    .set({
      status,
      attemptCount: status === "pending_delete" ? 0 : job.attemptCount,
      completedAt: status === "cancelled" ? new Date() : null,
      claimedAt: null,
      claimToken: null,
      nextRetryAt: null,
      lastError: status === "cancelled" ? job.lastError : null,
      updatedAt: new Date(),
    })
    .where(and(eq(imageCleanup.id, job.id), eq(imageCleanup.status, "failed")))
    .returning();
  if (!updated) {
    throw new HttpError(409, "Only a failed image deletion can be retried or cancelled");
  }
  return updated;
}

async function withLease(
  db: Database,
  job: ImageCleanupJob,
  renewEveryMs: number,
  now: () => Date,
  work: () => Promise<void>,
): Promise<void> {
  const timer = setInterval(() => {
    void renewLease(db, job, now());
  }, renewEveryMs);
  try {
    await work();
  } finally {
    clearInterval(timer);
  }
  if (!(await renewLease(db, job, now()))) {
    throw new LeaseLostError();
  }
}

async function renewLease(db: Database, job: ImageCleanupJob, at: Date): Promise<boolean> {
  if (!job.claimToken) {
    return false;
  }
  const [updated] = await db
    .update(imageCleanup)
    .set({ claimedAt: at, updatedAt: at })
    .where(
      and(
        eq(imageCleanup.id, job.id),
        eq(imageCleanup.claimToken, job.claimToken),
        eq(imageCleanup.status, job.status),
      ),
    )
    .returning({ id: imageCleanup.id });
  return Boolean(updated);
}

async function compareAndSwap(
  db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  job: ImageCleanupJob,
  status: ImageCleanupStatus,
  error: string | null,
): Promise<ImageCleanupJob | null> {
  if (!job.claimToken) {
    return null;
  }
  assertImageCleanupTransition(job.status, status);
  const terminal = status === "stored" || status === "abandoned" || status === "deleted" || status === "failed" || status === "cancelled";
  const [updated] = await db
    .update(imageCleanup)
    .set({
      status,
      lastError: error ? sanitizeCleanupError(error) : null,
      completedAt: terminal ? new Date() : null,
      nextRetryAt: null,
      claimedAt: terminal ? null : job.claimedAt,
      claimToken: terminal ? null : job.claimToken,
      updatedAt: new Date(),
    })
    .where(and(eq(imageCleanup.id, job.id), eq(imageCleanup.claimToken, job.claimToken), eq(imageCleanup.status, job.status)))
    .returning();
  return updated ?? null;
}

async function failJob(db: Database, job: ImageCleanupJob, message: string): Promise<ImageCleanupJob> {
  const failed = await compareAndSwap(db, job, "failed", message);
  if (!failed) {
    throw new LeaseLostError();
  }
  return failed;
}

async function scheduleRetryOrFail(
  db: Database,
  job: ImageCleanupJob,
  error: unknown,
  at: Date,
): Promise<ImageCleanupJob | null> {
  if (!job.claimToken) {
    return null;
  }
  const [current] = await db
    .select()
    .from(imageCleanup)
    .where(and(eq(imageCleanup.id, job.id), eq(imageCleanup.claimToken, job.claimToken)))
    .limit(1);
  if (!current?.claimToken) {
    return null;
  }
  const claimToken = current.claimToken;
  if (current.attemptCount >= current.maxAttempts) {
    return failJob(db, current, sanitizeCleanupError(error));
  }
  const delay = imageCleanupBackoffMs(current.attemptCount);
  const [updated] = await db
    .update(imageCleanup)
    .set({
      lastError: sanitizeCleanupError(error),
      nextRetryAt: new Date(at.getTime() + delay),
      claimedAt: null,
      claimToken: null,
      updatedAt: at,
    })
    .where(and(eq(imageCleanup.id, current.id), eq(imageCleanup.claimToken, claimToken), eq(imageCleanup.status, current.status)))
    .returning();
  return updated ?? null;
}

export function sanitizeCleanupError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "image cleanup failed";
  const sanitized = raw
    .replace(/https?:\/\/[^\s]+/gi, "[redacted]")
    .replace(/\b(authorization|secret|credential|token|access[_-]?key)[=:]\s*\S+/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return sanitized.length > 0 ? sanitized : "image cleanup failed";
}

function firstId(result: unknown): string | null {
  const rows = Array.isArray(result)
    ? result
    : typeof result === "object" && result !== null && "rows" in result && Array.isArray(result.rows)
      ? result.rows
      : [];
  const row = rows[0] as { id?: unknown } | undefined;
  return typeof row?.id === "string" ? row.id : null;
}

export { defaultLeaseMs, defaultMaxAttempts, defaultRenewMs };
