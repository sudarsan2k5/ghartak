import { adminDeliveryChargeSchema } from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../../../http/errors.js";
import { parseRequest } from "../../../http/validation.js";
import { requireAdmin } from "../auth/guard.js";
import { createAdminSettingsService } from "./settings.service.js";

export function registerAdminSettingsRoutes(app: FastifyInstance, db: Database): void {
  const settings = createAdminSettingsService(db);
  const guard = { preHandler: requireAdmin(db) };

  app.get("/admin/settings/delivery-charge", guard, async () => {
    return adminDeliveryChargeSchema.parse(await settings.getDeliveryCharge());
  });

  app.patch("/admin/settings/delivery-charge", guard, async (request) => {
    const body = parseRequest(() => adminDeliveryChargeSchema.parse(request.body));
    const actor = request.admin;
    if (!actor) {
      throw new HttpError(401, "Authentication required");
    }
    const updated = adminDeliveryChargeSchema.parse(await settings.updateDeliveryCharge(body, actor.userId));
    request.log.info(
      { actorUserId: actor.userId, deliveryFeePaise: updated.deliveryFeePaise },
      "admin updated delivery charge",
    );
    return updated;
  });
}
