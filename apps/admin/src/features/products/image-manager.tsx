"use client";

import { adminImageListResponseSchema, adminImageSchema } from "@ghartak/contracts";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, controlClassName } from "@/components/ui/field";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import type { ApiFailure } from "@/lib/api/client";
import { imageManagerActions } from "@/lib/products/image-actions";
import { resolveProductImage } from "@/lib/products/images";
import {
  cancelProductImageDeletion,
  deleteProductImage,
  reorderProductImages,
  retryProductImageDeletion,
  updateProductImage,
  uploadProductImage,
} from "@/lib/products/requests";

type Image = z.infer<typeof adminImageSchema>;

export function ImageManager({
  productId,
  productName,
  images,
  imageBase,
  onChange,
  onError,
}: {
  productId: string;
  productName: string;
  images: Image[];
  imageBase: string | null;
  onChange: (images: Image[]) => void;
  onError: (message: string) => void;
}) {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [isPrimary, setIsPrimary] = useState(images.length === 0);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Image | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleResult(result: { ok: true; data: z.infer<typeof adminImageListResponseSchema> } | ApiFailure) {
    if (!result.ok) {
      if (await redirect(result)) {
        return false;
      }
      onError(result.message);
      return false;
    }
    onChange(result.data.images);
    onError("");
    return true;
  }

  async function upload() {
    if (!client || !file || uploading) {
      return;
    }
    setUploading(true);
    const result = await uploadProductImage(client, productId, {
      file,
      altText,
      isPrimary,
      idempotencyKey,
    });
    setUploading(false);
    if (await handleResult(result)) {
      setFile(null);
      setAltText("");
      setIsPrimary(false);
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function patch(image: Image, body: { altText?: string | null; isPrimary?: boolean }) {
    if (!client || busyId || image.deletionStatus === "pending_delete") {
      return;
    }
    setBusyId(image.id);
    const result = await updateProductImage(client, productId, image.id, body);
    setBusyId(null);
    await handleResult(result);
  }

  async function move(imageId: string, direction: -1 | 1) {
    if (!client || busyId) {
      return;
    }
    const mutable = images.filter((image) => image.deletionStatus !== "pending_delete");
    const index = mutable.findIndex((image) => image.id === imageId);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= mutable.length) {
      return;
    }
    const next = [...mutable];
    const current = next[index];
    const other = next[swap];
    if (!current || !other) {
      return;
    }
    next[index] = other;
    next[swap] = current;
    setBusyId(imageId);
    const result = await reorderProductImages(
      client,
      productId,
      next.map((image) => image.id),
    );
    setBusyId(null);
    await handleResult(result);
  }

  async function confirmDelete() {
    if (!client || !deleteTarget || busyId) {
      return;
    }
    setBusyId(deleteTarget.id);
    const result = await deleteProductImage(client, productId, deleteTarget.id);
    setBusyId(null);
    setDeleteTarget(null);
    await handleResult(result);
  }

  async function retry(image: Image) {
    if (!client || busyId) {
      return;
    }
    setBusyId(image.id);
    const result = await retryProductImageDeletion(client, productId, image.id);
    setBusyId(null);
    await handleResult(result);
  }

  async function cancel(image: Image) {
    if (!client || busyId) {
      return;
    }
    setBusyId(image.id);
    const result = await cancelProductImageDeletion(client, productId, image.id);
    setBusyId(null);
    await handleResult(result);
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <h2 className="font-display text-lg font-extrabold">Images</h2>
      <p className="mt-2 text-sm leading-6 text-secondary">
        JPEG, PNG, and WebP stills up to 5 MB. One image can be primary. Photos pending deletion stay hidden from customers.
      </p>
      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void upload();
        }}
      >
        <Field id="product-image-file" label="Add image">
          <input
            id="product-image-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={controlClassName}
            disabled={uploading}
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setIdempotencyKey(crypto.randomUUID());
            }}
          />
        </Field>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Upload preview" className="h-40 w-full rounded-xl object-contain bg-wash" />
        ) : null}
        <Field id="product-image-alt" label="Alt text">
          <input
            id="product-image-alt"
            value={altText}
            maxLength={200}
            className={controlClassName}
            disabled={uploading}
            onChange={(event) => setAltText(event.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrimary} disabled={uploading} onChange={(event) => setIsPrimary(event.target.checked)} />
          Set as primary image
        </label>
        <button
          type="submit"
          className="h-11 w-fit rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink disabled:opacity-60"
          disabled={!file || uploading}
        >
          {uploading ? "Uploading" : "Upload image"}
        </button>
      </form>
      {images.length === 0 ? <p className="mt-4 text-sm text-muted">No images are stored for this product.</p> : null}
      <ul className="mt-4 space-y-4">
        {images.map((image) => {
          const src = resolveProductImage(image.deliveryPath, imageBase);
          const actions = imageManagerActions(image);
          return (
            <li key={image.id} className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={image.altText ?? productName} className="h-28 w-full rounded-xl object-contain" />
              ) : (
                <div className="grid h-28 place-items-center rounded-xl bg-wash text-sm text-muted">No preview</div>
              )}
              <div className="space-y-3 text-sm">
                <p>
                  {image.isPrimary ? "Primary" : "Gallery"}
                  {actions.pending ? " · Pending deletion" : ""}
                  {actions.failed ? " · Deletion failed" : ""}
                </p>
                <label className="block">
                  <span className="text-muted">Alt text</span>
                  <input
                    className={`${controlClassName} mt-1`}
                    defaultValue={image.altText ?? ""}
                    disabled={!actions.canEdit || busyId === image.id}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next !== (image.altText ?? "")) {
                        void patch(image, { altText: next.length === 0 ? null : next });
                      }
                    }}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-xl border border-line px-3 py-2 disabled:opacity-50" disabled={!actions.canReorder || busyId !== null} onClick={() => void move(image.id, -1)}>
                    Move up
                  </button>
                  <button type="button" className="rounded-xl border border-line px-3 py-2 disabled:opacity-50" disabled={!actions.canReorder || busyId !== null} onClick={() => void move(image.id, 1)}>
                    Move down
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-line px-3 py-2 disabled:opacity-50"
                    disabled={!actions.canMakePrimary || busyId !== null}
                    onClick={() => void patch(image, { isPrimary: true })}
                  >
                    Make primary
                  </button>
                  {actions.canRetryDeletion ? (
                    <>
                      <button type="button" className="rounded-xl border border-line px-3 py-2" disabled={busyId !== null} onClick={() => void retry(image)}>
                        Retry deletion
                      </button>
                      <button type="button" className="rounded-xl border border-line px-3 py-2" disabled={busyId !== null} onClick={() => void cancel(image)}>
                        Cancel deletion
                      </button>
                    </>
                  ) : (
                    <button type="button" className="rounded-xl border border-line px-3 py-2 disabled:opacity-50" disabled={!actions.canDelete || busyId !== null} onClick={() => setDeleteTarget(image)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {deleteTarget ? (
        <ConfirmDialog
          title={`Delete this image?`}
          body="The photo will be hidden from customers and then removed from storage. This cannot be undone from the catalogue."
          confirmLabel="Delete image"
          pending={busyId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </section>
  );
}
