import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  createdAt,
  e164,
  latitudeRange,
  longitudeRange,
  optionalEmail,
  postalCode,
  updatedAt,
} from "./columns.js";
import { accountStatusEnum, addressTypeEnum, userRoleEnum } from "./enums.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    passwordHash: text("password_hash"),
    status: accountStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("users_phone_unique").on(table.phone),
    unique("users_email_unique").on(table.email),
    check("users_name_length", sql`char_length(${table.name}) between 1 and 160`),
    check("users_phone_e164", e164(table.phone)),
    check("users_email_normalized", optionalEmail(table.email)),
    check(
      "users_password_hash_argon2id",
      sql`${table.passwordHash} is null or (${table.passwordHash} ~ '^[$]argon2id[$]' and char_length(${table.passwordHash}) between 50 and 255)`,
    ),
    index("users_status_idx").on(table.status),
  ],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("admin_sessions_token_hash_unique").on(table.tokenHash),
    check("admin_sessions_token_hash_format", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
    check("admin_sessions_expires_after_create", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "admin_sessions_revoked_after_create",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`,
    ),
    index("admin_sessions_user_id_idx").on(table.userId),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("user_roles_user_role_unique").on(table.userId, table.role),
    index("user_roles_user_id_idx").on(table.userId),
  ],
);

export const userAddresses = pgTable(
  "user_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addressType: addressTypeEnum("address_type").notNull(),
    contactName: text("contact_name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    landmark: text("landmark"),
    locality: text("locality").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }).notNull(),
    longitude: numeric("longitude", { precision: 9, scale: 6, mode: "number" }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("user_addresses_one_default_idx").on(table.userId).where(sql`${table.isDefault} = true`),
    check("user_addresses_phone_e164", e164(table.phone)),
    check("user_addresses_postal_code", postalCode(table.postalCode)),
    check("user_addresses_latitude", latitudeRange(table.latitude)),
    check("user_addresses_longitude", longitudeRange(table.longitude)),
    check("user_addresses_line1_length", sql`char_length(${table.line1}) between 1 and 200`),
    index("user_addresses_user_id_idx").on(table.userId),
  ],
);
