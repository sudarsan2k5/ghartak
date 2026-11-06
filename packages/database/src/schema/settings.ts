import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { updatedAt } from "./columns.js";
import { users } from "./identity.js";

export const appSettings = pgTable(
  "app_settings",
  {
    key: text("key").primaryKey(),
    valuePaise: integer("value_paise").notNull(),
    updatedAt: updatedAt(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    check("app_settings_key_format", sql`${table.key} ~ '^[a-z][a-z0-9_]{1,62}$'`),
    check("app_settings_value_paise_nonnegative", sql`${table.valuePaise} >= 0`),
    check("app_settings_value_paise_max", sql`${table.valuePaise} <= 1000000`),
  ],
);
