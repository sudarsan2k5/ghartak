import {
  adminDeliveryChargeSchema,
  DELIVERY_FEE_SETTING_KEY,
  type AdminDeliveryCharge,
} from "@ghartak/contracts";
import { appSettings, type Database } from "@ghartak/database";
import { eq } from "drizzle-orm";
import { HttpError } from "../../../http/errors.js";

export function createAdminSettingsService(db: Database) {
  return {
    async getDeliveryCharge(): Promise<AdminDeliveryCharge> {
      const [row] = await db
        .select({ valuePaise: appSettings.valuePaise })
        .from(appSettings)
        .where(eq(appSettings.key, DELIVERY_FEE_SETTING_KEY))
        .limit(1);
      if (!row) {
        throw new HttpError(500, "Delivery charge is not configured");
      }
      return adminDeliveryChargeSchema.parse({ deliveryFeePaise: row.valuePaise });
    },

    async updateDeliveryCharge(input: AdminDeliveryCharge, actorUserId: string): Promise<AdminDeliveryCharge> {
      const [row] = await db
        .update(appSettings)
        .set({
          valuePaise: input.deliveryFeePaise,
          updatedByUserId: actorUserId,
        })
        .where(eq(appSettings.key, DELIVERY_FEE_SETTING_KEY))
        .returning({ valuePaise: appSettings.valuePaise });
      if (!row) {
        throw new HttpError(500, "Delivery charge is not configured");
      }
      return adminDeliveryChargeSchema.parse({ deliveryFeePaise: row.valuePaise });
    },
  };
}
