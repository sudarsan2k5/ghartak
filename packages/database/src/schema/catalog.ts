import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
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
  slug,
  updatedAt,
} from "./columns.js";
import {
  imageStorageProviderEnum,
  productPublicationStatusEnum,
  serviceZoneKindEnum,
  storeProductAvailabilityEnum,
  storeStatusEnum,
} from "./enums.js";

export const serviceZones = pgTable(
  "service_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: serviceZoneKindEnum("kind").notNull(),
    state: text("state").notNull(),
    country: text("country").notNull().default("IN"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("service_zones_slug_unique").on(table.slug),
    check("service_zones_slug_format", slug(table.slug)),
    check("service_zones_name_length", sql`char_length(${table.name}) between 1 and 160`),
    index("service_zones_kind_idx").on(table.kind),
  ],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceZoneId: uuid("service_zone_id")
      .notNull()
      .references(() => serviceZones.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email"),
    line1: text("line1").notNull(),
    landmark: text("landmark"),
    locality: text("locality").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }).notNull(),
    longitude: numeric("longitude", { precision: 9, scale: 6, mode: "number" }).notNull(),
    status: storeStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("stores_zone_name_unique").on(table.serviceZoneId, table.name),
    uniqueIndex("stores_one_fulfilment_location_idx").on(sql`(true)`),
    check("stores_name_length", sql`char_length(${table.name}) between 1 and 160`),
    check("stores_phone_e164", e164(table.contactPhone)),
    check("stores_email_normalized", optionalEmail(table.contactEmail)),
    check("stores_postal_code", postalCode(table.postalCode)),
    check("stores_latitude", latitudeRange(table.latitude)),
    check("stores_longitude", longitudeRange(table.longitude)),
    index("stores_service_zone_id_idx").on(table.serviceZoneId),
    index("stores_status_idx").on(table.status),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    imageObjectKey: text("image_object_key"),
    imageDeliveryPath: text("image_delivery_path"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("categories_slug_unique").on(table.slug),
    check("categories_image_pair", sql`(${table.imageObjectKey} IS NULL) = (${table.imageDeliveryPath} IS NULL)`),
    index("categories_sort_order_idx").on(table.sortOrder),
    check("categories_slug_format", slug(table.slug)),
    check("categories_name_length", sql`char_length(${table.name}) between 1 and 160`),
  ],
);

export const homeDailyTiles = pgTable(
  "home_daily_tiles",
  {
    position: integer("position").primaryKey(),
    label: text("label").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    imageObjectKey: text("image_object_key"),
    imageDeliveryPath: text("image_delivery_path"),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("home_daily_tiles_position_range", sql`${table.position} BETWEEN 1 AND 4`),
    check("home_daily_tiles_label_length", sql`char_length(${table.label}) BETWEEN 1 AND 40`),
    check("home_daily_tiles_image_pair", sql`(${table.imageObjectKey} IS NULL) = (${table.imageDeliveryPath} IS NULL)`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    brand: text("brand"),
    description: text("description"),
    packageLabel: text("package_label").notNull(),
    publicationStatus: productPublicationStatusEnum("publication_status").notNull().default("published"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("products_name_length", sql`char_length(${table.name}) between 1 and 160`),
    check("products_brand_length", sql`${table.brand} is null or char_length(${table.brand}) between 1 and 120`),
    check("products_package_label_length", sql`char_length(${table.packageLabel}) between 1 and 80`),
    index("products_category_id_idx").on(table.categoryId),
    index("products_publication_status_idx").on(table.publicationStatus),
    index("products_active_idx").on(table.isActive),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    storageProvider: imageStorageProviderEnum("storage_provider").notNull().default("r2"),
    objectKey: text("object_key").notNull(),
    deliveryPath: text("delivery_path").notNull(),
    altText: text("alt_text"),
    position: integer("position").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("product_images_object_key_unique").on(table.objectKey),
    unique("product_images_product_position_unique").on(table.productId, table.position),
    uniqueIndex("product_images_one_primary_idx").on(table.productId).where(sql`${table.isPrimary} = true`),
    check(
      "product_images_object_key_format",
      sql`char_length(${table.objectKey}) between 1 and 512 and ${table.objectKey} ~ '^[A-Za-z0-9][A-Za-z0-9/._-]*$'`,
    ),
    check(
      "product_images_delivery_path_format",
      sql`${table.deliveryPath} ~ '^(/|https://)' and ${table.deliveryPath} !~ '[[:space:]]' and char_length(${table.deliveryPath}) between 1 and 2048`,
    ),
    check(
      "product_images_alt_text_length",
      sql`${table.altText} is null or char_length(${table.altText}) between 1 and 200`,
    ),
    check("product_images_position_nonnegative", sql`${table.position} >= 0`),
    index("product_images_product_id_idx").on(table.productId),
  ],
);

export const storeProducts = pgTable(
  "store_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    pricePaise: integer("price_paise").notNull(),
    mrpPaise: integer("mrp_paise"),
    stockQuantity: integer("stock_quantity").notNull(),
    availability: storeProductAvailabilityEnum("availability").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("store_products_id_store_unique").on(table.id, table.storeId),
    unique("store_products_store_product_unique").on(table.storeId, table.productId),
    unique("store_products_product_unique").on(table.productId),
    check("store_products_price_nonnegative", sql`${table.pricePaise} >= 0`),
    check("store_products_mrp_nonnegative", sql`${table.mrpPaise} IS NULL OR ${table.mrpPaise} >= 0`),
    check("store_products_stock_nonnegative", sql`${table.stockQuantity} >= 0`),
    check(
      "store_products_available_requires_stock",
      sql`${table.availability} <> 'available' or ${table.stockQuantity} > 0`,
    ),
    index("store_products_store_id_idx").on(table.storeId),
    index("store_products_product_id_idx").on(table.productId),
  ],
);
