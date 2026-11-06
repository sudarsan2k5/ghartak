export type AdminImageActionState = {
  pending: boolean;
  failed: boolean;
  canEdit: boolean;
  canReorder: boolean;
  canMakePrimary: boolean;
  canDelete: boolean;
  canRetryDeletion: boolean;
  canCancelDeletion: boolean;
};

export function imageManagerActions(image: {
  isPrimary: boolean;
  deletionStatus?: "pending_delete" | "failed" | null;
}): AdminImageActionState {
  const pending = image.deletionStatus === "pending_delete";
  const failed = image.deletionStatus === "failed";
  return {
    pending,
    failed,
    canEdit: !pending,
    canReorder: !pending,
    canMakePrimary: !pending && !image.isPrimary,
    canDelete: !pending && !failed,
    canRetryDeletion: failed,
    canCancelDeletion: failed,
  };
}
