import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./columns.js";
import { storeProducts } from "./catalog.js";
import { inventoryMovementTypeEnum } from "./enums.js";
import { users } from "./identity.js";

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeProductId: uuid("store_product_id")
      .notNull()
      .references(() => storeProducts.id, { onDelete: "restrict" }),
    movementType: inventoryMovementTypeEnum("movement_type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    stockAfter: integer("stock_after").notNull(),
    reason: text("reason"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    check("inventory_movements_stock_after_nonnegative", sql`${table.stockAfter} >= 0`),
    check(
      "inventory_movements_delta_sign",
      sql`(${table.movementType} = 'addition' and ${table.quantityDelta} > 0) or (${table.movementType} = 'removal' and ${table.quantityDelta} < 0) or (${table.movementType} = 'adjustment' and ${table.quantityDelta} <> 0)`,
    ),
    index("inventory_movements_store_product_created_idx").on(
      table.storeProductId,
      table.createdAt,
    ),
  ],
);
