import type { Database } from "@ghartak/database";
import { createImageLifecycle, type ImageLifecycle, type ImageLifecycleHooks } from "./image-lifecycle.js";
import type { ImageUploadStaging } from "./image-staging.js";
import type { ImageStorage } from "./image-storage.js";

export function createImageCleanupWorker(
  db: Database,
  storage: ImageStorage,
  options?: {
    staging?: ImageUploadStaging;
    hooks?: ImageLifecycleHooks;
    now?: () => Date;
    skipBucketVerify?: boolean;
  },
): ImageLifecycle {
  return createImageLifecycle(db, storage, options);
}

export async function processDueImageCleanupJobs(
  db: Database,
  storage: ImageStorage,
  limit = 25,
): Promise<void> {
  await createImageLifecycle(db, storage).processDue(limit);
}
