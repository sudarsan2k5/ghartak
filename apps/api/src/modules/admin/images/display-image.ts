import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { HttpError } from "../../../http/errors.js";
import { detectImageContent, displayObjectKey, type ImageContentType } from "./image-policy.js";
import { assertImageBucketReady, type ImageStorage } from "./image-storage.js";

export type DisplayImageUpload = {
  body: Uint8Array;
  contentType: ImageContentType;
};

export async function readDisplayImage(request: FastifyRequest): Promise<DisplayImageUpload> {
  if (!request.isMultipart()) {
    throw new HttpError(400, "Image uploads must be sent as multipart form data");
  }
  let body: Uint8Array | undefined;
  try {
    body = await (await request.file())?.toBuffer();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_PARTS_LIMIT" || code === "FST_FILES_LIMIT") {
      throw new HttpError(400, "Images must be between 1 byte and 5 MB");
    }
    throw new HttpError(400, "The image upload could not be read");
  }
  if (!body) {
    throw new HttpError(400, "An image file is required");
  }
  try {
    return { body, contentType: detectImageContent(body) };
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "The image is not valid");
  }
}

export async function storeDisplayImage(
  storage: ImageStorage | null,
  scope: string,
  upload: DisplayImageUpload,
): Promise<{ objectKey: string; deliveryPath: string }> {
  if (!storage) {
    throw new HttpError(503, "Image storage is not configured");
  }
  const objectKey = displayObjectKey(scope, randomUUID(), upload.contentType);
  try {
    await assertImageBucketReady(storage);
    await storage.put({ objectKey, body: upload.body, contentType: upload.contentType });
  } catch {
    throw new HttpError(503, "Image storage is temporarily unavailable");
  }
  return { objectKey, deliveryPath: `/${objectKey}` };
}

/** The database no longer references this object, so a failed delete only leaves an orphan to log. */
export async function discardDisplayImage(
  storage: ImageStorage | null,
  objectKey: string,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    await storage?.delete(objectKey);
  } catch (error) {
    log.warn({ err: error, objectKey }, "display image could not be deleted from storage");
  }
}
