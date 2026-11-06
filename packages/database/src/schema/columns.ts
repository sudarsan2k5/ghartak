import { sql, type SQL } from "drizzle-orm";
import { timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";

export function createdAt() {
  return timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
}

export function updatedAt() {
  return timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
}

export function e164(column: AnyPgColumn | SQL): SQL {
  return sql`${column} ~ '^\\+[1-9][0-9]{7,14}$'`;
}

export function optionalEmail(column: AnyPgColumn): SQL {
  return sql`${column} is null or (${column} = lower(${column}) and ${column} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')`;
}

export function latitudeRange(column: AnyPgColumn): SQL {
  return sql`${column} >= -90 and ${column} <= 90`;
}

export function longitudeRange(column: AnyPgColumn): SQL {
  return sql`${column} >= -180 and ${column} <= 180`;
}

export function postalCode(column: AnyPgColumn): SQL {
  return sql`${column} ~ '^[0-9]{6}$'`;
}

export function slug(column: AnyPgColumn): SQL {
  return sql`${column} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`;
}
