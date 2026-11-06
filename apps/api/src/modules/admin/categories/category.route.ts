import {
  adminCategoryCreateSchema,
  adminCategoryListResponseSchema,
  adminCategorySchema,
  adminCategoryUpdateSchema,
} from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import { routeParam, routeUuidSchema } from "../../../http/params.js";
import { parseRequest } from "../../../http/validation.js";
import { requireAdmin } from "../auth/guard.js";
import { createAdminCategoryService } from "./category.service.js";

export function registerAdminCategoryRoutes(app: FastifyInstance, db: Database): void {
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

  app.patch("/admin/categories/:categoryId", guard, async (request) => {
    const categoryId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "categoryId")));
    const body = parseRequest(() => adminCategoryUpdateSchema.parse(request.body));
    const category = adminCategorySchema.parse(await categories.update(categoryId, body));
    request.log.info({ actorUserId: request.admin?.userId, categoryId }, "admin updated category");
    return category;
  });

  app.delete("/admin/categories/:categoryId", guard, async (request, reply) => {
    const categoryId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "categoryId")));
    await categories.remove(categoryId);
    request.log.info({ actorUserId: request.admin?.userId, categoryId }, "admin deleted category");
    return reply.status(204).send();
  });
}
