import {
  adminCategoryCreateSchema,
  adminCategoryListResponseSchema,
  adminCategoryOrderSchema,
  adminCategorySchema,
  adminCategoryUpdateSchema,
} from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import { routeParam, routeUuidSchema } from "../../../http/params.js";
import { parseRequest } from "../../../http/validation.js";
import { requireAdmin } from "../auth/guard.js";
import { discardDisplayImage, readDisplayImage, storeDisplayImage } from "../images/display-image.js";
import type { ImageStorage } from "../images/image-storage.js";
import { createAdminCategoryService } from "./category.service.js";

export function registerAdminCategoryRoutes(app: FastifyInstance, db: Database, storage: ImageStorage | null): void {
  const categories = createAdminCategoryService(db);
  const guard = { preHandler: requireAdmin(db) };

  app.get("/admin/categories", guard, async () => {
    return adminCategoryListResponseSchema.parse(await categories.list());
  });

  app.post("/admin/categories", guard, async (request, reply) => {
    const body = parseRequest(() => adminCategoryCreateSchema.parse(request.body));
    const category = adminCategorySchema.parse(await categories.create(body));
    request.log.info({ actorUserId: request.admin?.userId, categoryId: category.id }, "admin created category");
    return reply.status(201).send(category);
  });

  app.put("/admin/categories/order", guard, async (request) => {
    const body = parseRequest(() => adminCategoryOrderSchema.parse(request.body));
    const listed = adminCategoryListResponseSchema.parse(await categories.reorder(body.categoryIds));
    request.log.info({ actorUserId: request.admin?.userId }, "admin reordered categories");
    return listed;
  });

  app.patch("/admin/categories/:categoryId", guard, async (request) => {
    const categoryId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "categoryId")));
    const body = parseRequest(() => adminCategoryUpdateSchema.parse(request.body));
    const category = adminCategorySchema.parse(await categories.update(categoryId, body));
    request.log.info({ actorUserId: request.admin?.userId, categoryId }, "admin updated category");
    return category;
  });

  app.delete("/admin/categories/:categoryId", guard, async (request, reply) => {
    const categoryId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "categoryId")));
    const imageKey = await categories.remove(categoryId);
    if (imageKey) {
      await discardDisplayImage(storage, imageKey, request.log);
    }
    request.log.info({ actorUserId: request.admin?.userId, categoryId }, "admin deleted category");
    return reply.status(204).send();
  });

  app.post("/admin/categories/:categoryId/image", guard, async (request) => {
    const categoryId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "categoryId")));
    const upload = await readDisplayImage(request);
    const image = await storeDisplayImage(storage, `categories/${categoryId}`, upload);
    let result;
    try {
      result = await categories.setImage(categoryId, image);
    } catch (error) {
      await discardDisplayImage(storage, image.objectKey, request.log);
      throw error;
    }
    if (result.previousKey) {
      await discardDisplayImage(storage, result.previousKey, request.log);
    }
    request.log.info({ actorUserId: request.admin?.userId, categoryId }, "admin updated category image");
    return adminCategorySchema.parse(result.category);
  });

  app.delete("/admin/categories/:categoryId/image", guard, async (request) => {
    const categoryId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "categoryId")));
    const result = await categories.setImage(categoryId, null);
    if (result.previousKey) {
      await discardDisplayImage(storage, result.previousKey, request.log);
    }
    request.log.info({ actorUserId: request.admin?.userId, categoryId }, "admin removed category image");
    return adminCategorySchema.parse(result.category);
  });
}
