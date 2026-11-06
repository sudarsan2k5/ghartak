import { imageCleanup, productImages, withTransaction, type Database, type DatabaseTransaction } from "@ghartak/database";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { HttpError } from "../../../http/errors.js";

export type AdminImageRow = {
  id: string;
  deliveryPath: string;
  altText: string | null;
  position: number;
  isPrimary: boolean;
  deletionStatus: "pending_delete" | "failed" | null;
};

export function createAdminImageService(db: Database) {
  return {
    async list(productId: string) {
      return listAdminImages(db, productId);
    },

    async update(productId: string, imageId: string, input: { altText?: string | null; isPrimary?: boolean }) {
      return withTransaction(db, async (tx) => {
        const [image] = await tx
          .select({ id: productImages.id, productId: productImages.productId })
          .from(productImages)
          .where(eq(productImages.id, imageId))
          .limit(1);
        if (!image || image.productId !== productId) {
          throw new HttpError(404, "Image not found");
        }
        await assertImageNotPendingDelete(tx, imageId);
        if (input.isPrimary) {
          await tx.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, productId));
        }
        await tx
          .update(productImages)
          .set({
            ...(input.altText !== undefined ? { altText: input.altText } : {}),
            ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
          })
          .where(eq(productImages.id, imageId));
        return listAdminImages(tx, productId);
      });
    },

    async reorder(productId: string, imageIds: string[]) {
      return withTransaction(db, async (tx) => {
        const existing = await listMutableImages(tx, productId);
        if (existing.length !== imageIds.length || existing.some((image) => !imageIds.includes(image.id))) {
          throw new HttpError(400, "Image order must include every image for the product once");
        }
        if (new Set(imageIds).size !== imageIds.length) {
          throw new HttpError(400, "Image order must include every image for the product once");
        }
        for (const imageId of imageIds) {
          await assertImageNotPendingDelete(tx, imageId);
        }
        await tx
          .update(productImages)
          .set({ position: sql`${productImages.position} + 1000` })
          .where(eq(productImages.productId, productId));
        for (const [position, imageId] of imageIds.entries()) {
          await tx.update(productImages).set({ position }).where(eq(productImages.id, imageId));
        }
        return listAdminImages(tx, productId);
      });
    },
  };
}

export async function listAdminImages(
  db: Database | DatabaseTransaction,
  productId: string,
): Promise<AdminImageRow[]> {
  const rows = await db
    .select({
      id: productImages.id,
      deliveryPath: productImages.deliveryPath,
      altText: productImages.altText,
      position: productImages.position,
      isPrimary: productImages.isPrimary,
    })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.position));
  if (rows.length === 0) {
    return [];
  }
  const jobs = await db
    .select({
      imageId: imageCleanup.imageId,
      status: imageCleanup.status,
    })
    .from(imageCleanup)
    .where(
      and(
        inArray(
          imageCleanup.imageId,
          rows.map((row) => row.id),
        ),
        eq(imageCleanup.operation, "delete"),
        inArray(imageCleanup.status, ["pending_delete", "failed"]),
      ),
    );
  const statusByImage = new Map<string, "pending_delete" | "failed">();
  for (const job of jobs) {
    if (job.status === "pending_delete" || job.status === "failed") {
      statusByImage.set(job.imageId, job.status);
    }
  }
  return rows.map((row) => ({
    ...row,
    deletionStatus: statusByImage.get(row.id) ?? null,
  }));
}

async function listMutableImages(db: Database | DatabaseTransaction, productId: string) {
  const images = await listAdminImages(db, productId);
  return images.filter((image) => image.deletionStatus !== "pending_delete");
}

async function assertImageNotPendingDelete(db: Database | DatabaseTransaction, imageId: string): Promise<void> {
  const [pending] = await db
    .select({ id: imageCleanup.id })
    .from(imageCleanup)
    .where(and(eq(imageCleanup.imageId, imageId), eq(imageCleanup.status, "pending_delete")))
    .limit(1);
  if (pending) {
    throw new HttpError(409, "This image is scheduled for deletion");
  }
}
