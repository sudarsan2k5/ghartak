import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { imageCleanup, imageCleanupArchive } from "./schema/images.js";

const archivable = ["stored", "abandoned", "deleted", "failed", "cancelled"] as const;

export async function archiveTerminalImageCleanup(db: Database, productId: string): Promise<number> {
  const rows = await db
    .select()
    .from(imageCleanup)
    .where(and(eq(imageCleanup.productId, productId), inArray(imageCleanup.status, [...archivable])));
  if (rows.length === 0) {
    return 0;
  }
  await db.insert(imageCleanupArchive).values(
    rows.map((row) => ({
      id: row.id,
      operation: row.operation,
      status: row.status,
      productId: row.productId,
      imageId: row.imageId,
      objectKey: row.objectKey,
      attemptCount: row.attemptCount,
      lastError: row.lastError,
      createdAt: row.createdAt,
      completedAt: row.completedAt ?? row.updatedAt,
    })),
  );
  await db.delete(imageCleanup).where(
    and(
      eq(imageCleanup.productId, productId),
      inArray(
        imageCleanup.id,
        rows.map((row) => row.id),
      ),
    ),
  );
  return rows.length;
}
