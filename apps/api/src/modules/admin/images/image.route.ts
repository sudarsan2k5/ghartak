import { adminImageListResponseSchema, adminImageOrderSchema, adminImageUpdateSchema } from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "../../../http/errors.js";
import { routeParam, routeUuidSchema } from "../../../http/params.js";
import { parseRequest } from "../../../http/validation.js";
import { requireAdmin } from "../auth/guard.js";
import { createImageLifecycle } from "./image-lifecycle.js";
import { detectImageContent } from "./image-policy.js";
import { createAdminImageService, listAdminImages } from "./image.service.js";
import type { ImageStorage } from "./image-storage.js";

const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

export function registerAdminImageRoutes(
  app: FastifyInstance,
  db: Database,
  storage: ImageStorage | null,
): void {
  const images = createAdminImageService(db);
  const guard = { preHandler: requireAdmin(db) };

  app.post("/admin/products/:productId/images", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const lifecycle = requireLifecycle(db, storage);
    const upload = await readImageUpload(request);
    request.log.info(
      { actorUserId: request.admin?.userId, productId, byteLength: upload.body.byteLength, contentType: upload.contentType },
      "admin queued product image upload",
    );
    try {
      const job = await lifecycle.enqueueUpload({
        productId,
        body: upload.body,
        contentType: upload.contentType,
        altText: upload.altText,
        isPrimary: upload.isPrimary,
        idempotencyKey: upload.idempotencyKey,
      });
      const settled = await lifecycle.settle(job.id);
      if (settled.status !== "stored") {
        throw new HttpError(503, "Image storage is temporarily unavailable");
      }
      const listed = await listAdminImages(db, productId);
      const image = listed.find((row) => row.id === settled.imageId);
      return adminImageListResponseSchema.parse({ images: listed, image });
    } catch (error) {
      throw mapImageError(error);
    }
  });

  app.delete("/admin/products/:productId/images/:imageId", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const imageId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "imageId")));
    const lifecycle = requireLifecycle(db, storage);
    request.log.info({ actorUserId: request.admin?.userId, productId, imageId }, "admin queued product image deletion");
    try {
      const job = await lifecycle.enqueueDelete(productId, imageId);
      const settled = await lifecycle.settle(job.id);
      const listed = await listAdminImages(db, productId);
      return adminImageListResponseSchema.parse({
        images: listed,
        deletion: { status: deletionStatus(settled.status), imageId: settled.imageId },
      });
    } catch (error) {
      throw mapImageError(error);
    }
  });

  app.patch("/admin/products/:productId/images/:imageId", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const imageId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "imageId")));
    const body = parseRequest(() => adminImageUpdateSchema.parse(request.body));
    const updated = await images.update(productId, imageId, {
      ...(body.altText !== undefined ? { altText: body.altText } : {}),
      ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
    });
    request.log.info({ actorUserId: request.admin?.userId, productId, imageId }, "admin updated image metadata");
    return adminImageListResponseSchema.parse({ images: updated });
  });

  app.post("/admin/products/:productId/images/:imageId/deletion/retry", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const imageId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "imageId")));
    const lifecycle = requireLifecycle(db, storage);
    const job = await lifecycle.retryFailedDelete(productId, imageId);
    const settled = await lifecycle.settle(job.id);
    const listed = await listAdminImages(db, productId);
    return adminImageListResponseSchema.parse({
      images: listed,
      deletion: { status: deletionStatus(settled.status), imageId: settled.imageId },
    });
  });

  app.post("/admin/products/:productId/images/:imageId/deletion/cancel", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const imageId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "imageId")));
    const lifecycle = createImageLifecycle(db, storage ?? unavailableStorage(), { skipBucketVerify: true });
    const job = await lifecycle.cancelFailedDelete(productId, imageId);
    const listed = await listAdminImages(db, productId);
    return adminImageListResponseSchema.parse({
      images: listed,
      deletion: { status: "cancelled", imageId: job.imageId },
    });
  });

  app.put("/admin/products/:productId/images/order", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const body = parseRequest(() => adminImageOrderSchema.parse(request.body));
    const updated = await images.reorder(productId, body.imageIds);
    request.log.info({ actorUserId: request.admin?.userId, productId }, "admin reordered images");
    return adminImageListResponseSchema.parse({ images: updated });
  });
}

async function readImageUpload(request: FastifyRequest): Promise<{
  body: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  altText: string | null;
  isPrimary: boolean;
  idempotencyKey: string;
}> {
  const rawKey = request.headers["idempotency-key"];
  const idempotencyKey = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!idempotencyKeyPattern.test(idempotencyKey)) {
    throw new HttpError(400, "An Idempotency-Key header is required");
  }
  if (!request.isMultipart()) {
    throw new HttpError(400, "Image uploads must be sent as multipart form data");
  }
  let fileName = "upload";
  let body: Uint8Array | undefined;
  let altText: string | null = null;
  let isPrimary = false;
  try {
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (body) {
          throw new HttpError(400, "Upload exactly one image file");
        }
        fileName = part.filename || "upload";
        if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
          throw new HttpError(400, "The image file name is not valid");
        }
        body = await part.toBuffer();
      } else if (part.fieldname === "altText") {
        const value = String(part.value).trim();
        altText = value.length === 0 ? null : value.slice(0, 200);
      } else if (part.fieldname === "isPrimary") {
        isPrimary = String(part.value) === "true";
      }
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    const code = (error as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_PARTS_LIMIT") {
      throw new HttpError(400, "Images must be between 1 byte and 5 MB");
    }
    throw new HttpError(400, "The image upload could not be read");
  }
  void fileName;
  if (!body) {
    throw new HttpError(400, "An image file is required");
  }
  try {
    return {
      body,
      contentType: detectImageContent(body),
      altText,
      isPrimary,
      idempotencyKey,
    };
  } catch (error) {
    throw mapImageError(error);
  }
}

function requireLifecycle(db: Database, storage: ImageStorage | null) {
  if (!storage) {
    throw new HttpError(503, "Image storage is not configured");
  }
  return createImageLifecycle(db, storage);
}

function deletionStatus(status: string): "pending_delete" | "deleted" | "failed" | "cancelled" {
  if (status === "pending_delete" || status === "deleted" || status === "failed" || status === "cancelled") {
    return status;
  }
  return "pending_delete";
}

function mapImageError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "The image request could not be completed";
  if (
    message.includes("JPEG") ||
    message.includes("PNG") ||
    message.includes("WebP") ||
    message.includes("GIF") ||
    message.includes("SVG") ||
    message.includes("Animated") ||
    message.includes("5 MB") ||
    message.includes("1 byte")
  ) {
    return new HttpError(400, message);
  }
  if (message.includes("staging capacity")) {
    return new HttpError(503, "Image storage is temporarily unavailable");
  }
  if (message.includes("bucket verification")) {
    return new HttpError(503, "Image storage is temporarily unavailable");
  }
  return new HttpError(500, "Internal server error");
}

function unavailableStorage(): ImageStorage {
  return {
    configured: true,
    bucket: "unconfigured",
    publicBaseUrl: "https://images.invalid",
    async verify() {
      return { httpStatus: undefined };
    },
    async head() {
      return { httpStatus: undefined };
    },
    async put() {
      throw new Error("Image upload is not enabled");
    },
    async delete() {
      throw new Error("Image upload is not enabled");
    },
  };
}
