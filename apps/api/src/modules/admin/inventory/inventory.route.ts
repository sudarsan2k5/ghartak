import {
  adminPriceResponseSchema,
  adminPriceUpdateSchema,
  adminStockChangeSchema,
  adminStockResponseSchema,
} from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../../../http/errors.js";
import { routeParam, routeUuidSchema } from "../../../http/params.js";
import { parseRequest } from "../../../http/validation.js";
import { requireAdmin } from "../auth/guard.js";
import { createAdminInventoryService } from "./inventory.service.js";

export function registerAdminInventoryRoutes(app: FastifyInstance, db: Database): void {
  const inventory = createAdminInventoryService(db);
  const guard = { preHandler: requireAdmin(db) };

  app.patch("/admin/products/:productId/price", guard, async (request) => {
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const body = parseRequest(() => adminPriceUpdateSchema.parse(request.body));
    const result = adminPriceResponseSchema.parse(await inventory.updatePrice(productId, body));
    request.log.info({ actorUserId: request.admin?.userId, productId, pricePaise: body.pricePaise }, "admin updated price");
    return result;
  });

  app.post("/admin/products/:productId/stock", guard, async (request) => {
    const actor = request.admin;
    if (!actor) {
      throw new HttpError(401, "Authentication required");
    }
    const productId = parseRequest(() => routeUuidSchema.parse(routeParam(request.params, "productId")));
    const body = parseRequest(() => adminStockChangeSchema.parse(request.body));
    const result = adminStockResponseSchema.parse(await inventory.changeStock(productId, body, actor.userId));
    request.log.info(
      {
        actorUserId: actor.userId,
        productId,
        movementType: body.type,
        stockAfter: result.inventory.stockQuantity,
      },
      "admin changed stock",
    );
    return result;
  });
}
