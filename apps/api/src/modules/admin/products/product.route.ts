import {
  adminProductCreateSchema,
  adminProductListQuerySchema,
  adminProductListResponseSchema,
  adminProductSchema,
  adminProductUpdateSchema,
} from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../../../http/errors.js";
import { parseRequest } from "../../../http/validation.js";
import { routeParam, routeUuidSchema } from "../../../http/params.js";
import { requireAdmin } from "../auth/guard.js";
import { createAdminProductService } from "./product.service.js";

export function registerAdminProductRoutes(app: FastifyInstance, db: Database): void {
  const products = createAdminProductService(db);
  const guard = { preHandler: requireAdmin(db) };

  app.get("/admin/products", guard, async (request) => {
    const query = parseRequest(() => adminProductListQuerySchema.parse(request.query));
    return adminProductListResponseSchema.parse(await products.list(query));
  });

  app.post("/admin/products", guard, async (request) => {
    const body = parseRequest(() => adminProductCreateSchema.parse(request.body));
    const actor = request.admin;
    if (!actor) {
      throw new HttpError(401, "Authentication required");
    }
    const product = adminProductSchema.parse(await products.create(body, actor.userId));
    request.log.info({ actorUserId: request.admin?.userId, productId: product.id }, "admin created product");
    return product;
  });

  app.get("/admin/products/:productId", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    return adminProductSchema.parse(await products.get(productId));
  });

  app.patch("/admin/products/:productId", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const body = parseRequest(() => adminProductUpdateSchema.parse(request.body));
    const product = adminProductSchema.parse(await products.update(productId, body));
    request.log.info({ actorUserId: request.admin?.userId, productId }, "admin updated product");
    return product;
  });

  app.delete("/admin/products/:productId", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const product = adminProductSchema.parse(await products.archive(productId));
    request.log.info({ actorUserId: request.admin?.userId, productId }, "admin archived product");
    return product;
  });
}
