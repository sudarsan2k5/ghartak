import type { ImageCleanupStatus } from "@ghartak/contracts";

const allowed: Record<ImageCleanupStatus, readonly ImageCleanupStatus[]> = {
  pending_upload: ["uploaded", "abandoned", "failed"],
  uploaded: ["stored", "failed"],
  stored: [],
  abandoned: [],
  pending_delete: ["deleted", "failed"],
  deleted: [],
  failed: ["pending_delete", "cancelled"],
  cancelled: [],
};

export function canTransitionImageCleanupStatus(
  from: ImageCleanupStatus,
  to: ImageCleanupStatus,
): boolean {
  return allowed[from].includes(to);
}

export function assertImageCleanupTransition(from: ImageCleanupStatus, to: ImageCleanupStatus): void {
  if (!canTransitionImageCleanupStatus(from, to)) {
    throw new Error(`invalid image cleanup transition: ${from} -> ${to}`);
  }
}

const closedStatuses = new Set<ImageCleanupStatus>(["stored", "abandoned", "deleted", "failed", "cancelled"]);

export function isTerminalImageCleanupStatus(status: ImageCleanupStatus): boolean {
  return closedStatuses.has(status);
}

export function imageCleanupBackoffMs(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(15 * 60 * 1000, 1000 * 2 ** exponent);
}
