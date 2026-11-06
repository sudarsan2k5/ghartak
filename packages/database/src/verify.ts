import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  accountStatusValues,
  addressTypeValues,
  cartStatusValues,
  imageCleanupOperationValues,
  imageCleanupStatusValues,
  imageStorageProviderValues,
  inventoryMovementTypeValues,
  orderPaymentStatusValues,
  productPublicationStatusValues,
  orderStatusValues,
  paymentMethodValues,
  paymentStatusValues,
  productUnitValues,
  serviceZoneKindValues,
  storeProductAvailabilityValues,
  storeStatusValues,
  userRoleValues,
} from "@ghartak/contracts";
import { eq, sql } from "drizzle-orm";
import {
  assertImageCleanupTransition,
  canTransitionImageCleanupStatus,
} from "./image-cleanup-status.js";
import {
  assertOrderStatusTransition,
  canTransitionOrderStatus,
} from "./order-status.js";
import { closeDatabase, openDatabase, withTransaction, type Database } from "./client.js";
import { seedIds } from "./seed.js";
import {
  accountStatusEnum,
  addressTypeEnum,
  cartItems,
  cartStatusEnum,
  carts,
  imageCleanup,
  imageCleanupOperationEnum,
  imageCleanupStatusEnum,
  imageStorageProviderEnum,
  inventoryMovementTypeEnum,
  inventoryMovements,
  orderAddresses,
  orderItems,
  orderPaymentStatusEnum,
  orderStatusEnum,
  orderStatusEvents,
  orders,
  paymentMethodEnum,
  paymentStatusEnum,
  payments,
  productAttributes,
  productImages,
  productPublicationStatusEnum,
  productUnitEnum,
  products,
  serviceZoneKindEnum,
  storeProductAvailabilityEnum,
  storeProducts,
  storeStatusEnum,
  stores,
  userAddresses,
  userRoleEnum,
  userRoles,
  users,
} from "./schema/index.js";

type QueryRow = Record<string, unknown>;

type CheckResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

class Rollback extends Error {
  constructor() {
    super("rollback");
    this.name = "Rollback";
  }
}

const expectedTables = [
  "users",
  "user_roles",
  "admin_sessions",
  "user_addresses",
  "service_zones",
  "stores",
  "categories",
  "products",
  "product_attributes",
  "product_images",
  "store_products",
  "inventory_movements",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "order_addresses",
  "order_status_events",
  "payments",
  "app_settings",
  "guest_checkout_requests",
  "image_cleanup",
  "image_cleanup_archive",
] as const;

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const db = openDatabase(connectionString);
  const results: CheckResult[] = [];

  try {
    await check(results, "tables exist", () => assertTables(db));
    await check(results, "foreign keys and delete actions", () => assertForeignKeys(db));
    await check(results, "admin authentication columns", () => assertAdminAuth(db));
    await check(results, "guest checkout columns", () => assertGuestCheckoutSchema(db));
    await check(results, "order tracking columns", () => assertOrderTrackingSchema(db));
    await check(results, "image cleanup outbox schema", () => assertImageCleanupSchema(db));
    await check(results, "unique and check constraints", () => assertConstraintKinds(db));
    await check(results, "partial unique indexes", () => assertPartialIndexes(db));
    await check(results, "database enums match contracts", () => {
      assertSameValues(userRoleEnum.enumValues, userRoleValues);
      assertSameValues(accountStatusEnum.enumValues, accountStatusValues);
      assertSameValues(addressTypeEnum.enumValues, addressTypeValues);
      assertSameValues(serviceZoneKindEnum.enumValues, serviceZoneKindValues);
      assertSameValues(storeStatusEnum.enumValues, storeStatusValues);
      assertSameValues(productUnitEnum.enumValues, productUnitValues);
      assertSameValues(productPublicationStatusEnum.enumValues, productPublicationStatusValues);
      assertSameValues(imageStorageProviderEnum.enumValues, imageStorageProviderValues);
      assertSameValues(imageCleanupOperationEnum.enumValues, imageCleanupOperationValues);
      assertSameValues(imageCleanupStatusEnum.enumValues, imageCleanupStatusValues);
      assertSameValues(storeProductAvailabilityEnum.enumValues, storeProductAvailabilityValues);
      assertSameValues(inventoryMovementTypeEnum.enumValues, inventoryMovementTypeValues);
      assertSameValues(cartStatusEnum.enumValues, cartStatusValues);
      assertSameValues(orderStatusEnum.enumValues, orderStatusValues);
      assertSameValues(paymentMethodEnum.enumValues, paymentMethodValues);
      assertSameValues(orderPaymentStatusEnum.enumValues, orderPaymentStatusValues);
      assertSameValues(paymentStatusEnum.enumValues, paymentStatusValues);
    });
    await check(results, "order status transitions", () => {
      if (!canTransitionOrderStatus("placed", "confirmed")) {
        throw new Error("placed to confirmed should be allowed");
      }
      if (canTransitionOrderStatus("placed", "delivered")) {
        throw new Error("placed to delivered should be rejected");
      }
      if (canTransitionOrderStatus("delivered", "cancelled")) {
        throw new Error("delivered to cancelled should be rejected");
      }
      assertOrderStatusTransition("packed", "out_for_delivery");
      let rejected = false;
      try {
        assertOrderStatusTransition("cancelled", "placed");
      } catch {
        rejected = true;
      }
      if (!rejected) {
        throw new Error("cancelled to placed should throw");
      }
    });
    await check(results, "image cleanup transitions", () => {
      if (!canTransitionImageCleanupStatus("pending_upload", "uploaded")) {
        throw new Error("pending_upload to uploaded should be allowed");
      }
      if (canTransitionImageCleanupStatus("pending_upload", "stored")) {
        throw new Error("pending_upload to stored should be rejected");
      }
      assertImageCleanupTransition("uploaded", "stored");
      let rejected = false;
      try {
        assertImageCleanupTransition("stored", "pending_delete");
      } catch {
        rejected = true;
      }
      if (!rejected) {
        throw new Error("stored to pending_delete should throw");
      }
    });
    await check(results, "image cleanup row rolls back", () =>
      rollbackAfter(db, async (tx) => {
        await tx.insert(imageCleanup).values({
          operation: "upload",
          status: "pending_upload",
          productId: seedIds.dal,
          imageId: randomUUID(),
          objectKey: `catalog/${seedIds.dal}/${randomUUID()}.jpg`,
          contentType: "image/jpeg",
          byteLength: 12,
        });
      }),
    );
    await check(results, "duplicate phone is rejected", () =>
      expectSqlState(async () => {
        const phone = nextPhone();
        await db.transaction(async (tx) => {
          await tx.insert(users).values(userRow(phone));
          await tx.insert(users).values({ ...userRow(phone), id: randomUUID(), email: null });
        });
      }, "23505"),
    );
    await check(results, "two default addresses are rejected", () =>
      expectSqlState(async () => {
        await db.transaction(async (tx) => {
          const userId = randomUUID();
          await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
          await tx.insert(userAddresses).values(addressRow(userId, true, "home"));
          await tx.insert(userAddresses).values(addressRow(userId, true, "work"));
        });
      }, "23505"),
    );
    await check(results, "multiple addresses with one default succeed", () =>
      rollbackAfter(db, async (tx) => {
        const userId = randomUUID();
        await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
        await tx.insert(userAddresses).values([
          addressRow(userId, true, "home"),
          addressRow(userId, false, "work"),
        ]);
        const rows = await tx
          .select({ id: userAddresses.id })
          .from(userAddresses)
          .where(eq(userAddresses.userId, userId));
        if (rows.length !== 2) {
          throw new Error(`expected 2 addresses, found ${rows.length}`);
        }
      }),
    );
    await check(results, "duplicate store product is rejected", () =>
      expectSqlState(
        () =>
          db.insert(storeProducts).values({
            storeId: seedIds.fulfilment,
            productId: seedIds.dal,
            pricePaise: 1,
            stockQuantity: 1,
            availability: "available",
          }),
        "23505",
      ),
    );
    await check(results, "a second fulfilment location is rejected", () =>
      expectSqlState(
        () =>
          db.insert(stores).values({
            serviceZoneId: seedIds.zone,
            name: "Second Warehouse",
            contactPhone: "+919876500099",
            line1: "2 Warehouse Lane",
            locality: "Demo Village",
            city: "Demo Village",
            state: "Uttar Pradesh",
            postalCode: "226001",
            latitude: 26.51,
            longitude: 80.51,
          }),
        "23505",
      ),
    );
    await check(results, "each product has one central price and stock record", () =>
      assertCentralInventory(db),
    );
    await check(results, "a customer cannot have two active carts", () =>
      expectSqlState(async () => {
        await db.transaction(async (tx) => {
          const userId = randomUUID();
          await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
          await tx.insert(carts).values({
            userId,
            storeId: seedIds.fulfilment,
            status: "active",
          });
          await tx.insert(carts).values({
            userId,
            storeId: seedIds.fulfilment,
            status: "active",
          });
        });
      }, "23505"),
    );
    await check(results, "admin role can still be assigned", () =>
      rollbackAfter(db, async (tx) => {
        const userId = randomUUID();
        await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
        await tx.insert(userRoles).values({ userId, role: "admin" });
      }),
    );
    await check(results, "merchant role cannot be assigned", () =>
      expectSqlState(async () => {
        await db.transaction(async (tx) => {
          const userId = randomUUID();
          await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
          await tx.execute(sql`insert into user_roles (user_id, role) values (${userId}, 'store_manager')`);
        });
      }, "22P02"),
    );
    await check(results, "invalid cart quantity is rejected", () =>
      expectSqlState(async () => {
        await db.transaction(async (tx) => {
          const userId = randomUUID();
          const cartId = randomUUID();
          await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
          await tx.insert(carts).values({
            id: cartId,
            userId,
            storeId: seedIds.fulfilment,
            status: "active",
          });
          const [storeProduct] = await tx
            .select({ id: storeProducts.id })
            .from(storeProducts)
            .where(eq(storeProducts.id, "10000000-0000-4000-8000-000000000041"));
          if (!storeProduct) {
            throw new Error("seed store product is missing");
          }
          await tx.insert(cartItems).values({
            cartId,
            storeId: seedIds.fulfilment,
            storeProductId: storeProduct.id,
            quantity: 0,
          });
        });
      }, "23514"),
    );
    await check(results, "cart item must reference the central listing", () =>
      expectSqlState(async () => {
        await db.transaction(async (tx) => {
          const userId = randomUUID();
          const cartId = randomUUID();
          await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
          await tx.insert(carts).values({
            id: cartId,
            userId,
            storeId: seedIds.fulfilment,
            status: "active",
          });
          await tx.insert(cartItems).values({
            cartId,
            storeId: seedIds.fulfilment,
            storeProductId: randomUUID(),
            quantity: 1,
          });
        });
      }, "23503"),
    );
    await check(results, "order amount formula is enforced", () =>
      expectSqlState(async () => {
        await db.transaction(async (tx) => {
          const userId = randomUUID();
          await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
          await tx.insert(orders).values({
            ...orderRow(userId, orderNumber()),
            totalPaise: 1,
          });
        });
      }, "23514"),
    );
    await check(results, "monetary values round-trip as integers", () =>
      rollbackAfter(db, async (tx) => {
        const userId = randomUUID();
        const orderId = randomUUID();
        await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
        await tx.insert(orders).values({ ...orderRow(userId, orderNumber()), id: orderId });
        const [row] = await tx
          .select({
            subtotalPaise: orders.subtotalPaise,
            totalPaise: orders.totalPaise,
          })
          .from(orders)
          .where(eq(orders.id, orderId));
        if (!row || row.subtotalPaise !== 10001 || row.totalPaise !== 12180) {
          throw new Error("paise values were not stored exactly");
        }
      }),
    );
    await check(results, "order item snapshot stays unchanged", () =>
      rollbackAfter(db, async (tx) => {
        const userId = randomUUID();
        const orderId = randomUUID();
        const itemId = randomUUID();
        await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
        await tx.insert(orders).values({ ...orderRow(userId, orderNumber()), id: orderId });
        await tx.insert(orderItems).values({
          id: itemId,
          orderId,
          productId: seedIds.dal,
          productName: "Toor Dal",
          sku: "DAL-TOOR-1KG",
          quantity: 2,
          unitPricePaise: 12000,
          lineTotalPaise: 24000,
        });
        await tx.update(products).set({ name: "Renamed Dal" }).where(eq(products.id, seedIds.dal));
        const [item] = await tx
          .select({ productName: orderItems.productName, sku: orderItems.sku, quantity: orderItems.quantity })
          .from(orderItems)
          .where(eq(orderItems.id, itemId));
        if (!item || item.productName !== "Toor Dal" || item.sku !== "DAL-TOOR-1KG" || item.quantity !== 2) {
          throw new Error("order item snapshot changed");
        }
      }),
    );
    await check(results, "order status history is preserved", () =>
      rollbackAfter(db, async (tx) => {
        const userId = randomUUID();
        const orderId = randomUUID();
        await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
        await tx.insert(orders).values({ ...orderRow(userId, orderNumber()), id: orderId });
        await tx.insert(orderStatusEvents).values([
          { orderId, fromStatus: null, toStatus: "placed" },
          { orderId, fromStatus: "placed", toStatus: "confirmed" },
        ]);
        const events = await tx
          .select({ toStatus: orderStatusEvents.toStatus })
          .from(orderStatusEvents)
          .where(eq(orderStatusEvents.orderId, orderId));
        if (events.length !== 2) {
          throw new Error(`expected 2 status events, found ${events.length}`);
        }
      }),
    );
    await check(results, "inventory movement is recorded", () =>
      rollbackAfter(db, async (tx) => {
        const movementId = randomUUID();
        await tx.insert(inventoryMovements).values({
          id: movementId,
          storeProductId: "10000000-0000-4000-8000-000000000041",
          movementType: "removal",
          quantityDelta: -1,
          stockAfter: 39,
          reason: "verification",
        });
        const [row] = await tx
          .select({ quantityDelta: inventoryMovements.quantityDelta })
          .from(inventoryMovements)
          .where(eq(inventoryMovements.id, movementId));
        if (!row || row.quantityDelta !== -1) {
          throw new Error("inventory movement was not stored");
        }
      }),
    );
    await check(results, "invalid inventory delta is rejected", () =>
      expectSqlState(
        () =>
          db.insert(inventoryMovements).values({
            storeProductId: "10000000-0000-4000-8000-000000000041",
            movementType: "addition",
            quantityDelta: -5,
            stockAfter: 35,
          }),
        "23514",
      ),
    );
    await check(results, "missing user foreign key is rejected", () =>
      expectSqlState(
        () =>
          db.insert(orders).values({
            ...orderRow(randomUUID(), orderNumber()),
          }),
        "23503",
      ),
    );
    await check(results, "duplicate payment idempotency key is rejected", () =>
      expectSqlState(async () => {
        await db.transaction(async (tx) => {
          const userId = randomUUID();
          const orderId = randomUUID();
          const key = `idem-${randomUUID()}`;
          await tx.insert(users).values({ ...userRow(nextPhone()), id: userId });
          await tx.insert(orders).values({ ...orderRow(userId, orderNumber()), id: orderId });
          await tx.insert(payments).values(paymentRow(orderId, key));
          await tx.insert(payments).values({ ...paymentRow(orderId, key), id: randomUUID() });
        });
      }, "23505"),
    );
    await check(results, "transaction rollback leaves no user", () => assertRollback(db));
    await check(results, "committed order graph and delete restriction", () =>
      assertCommittedOrder(db),
    );
    await check(results, "stock transaction rollback restores quantity", () =>
      assertStockRollback(db),
    );
    await check(results, "catalogue images keep one primary and a delivery path", () =>
      assertCatalogueImages(db),
    );
    await check(results, "a product can have only one primary image", () =>
      expectSqlState(
        () =>
          db.insert(productImages).values({
            productId: seedIds.dal,
            objectKey: "catalog/toor-dal/extra-primary.jpg",
            deliveryPath: "/catalog/toor-dal/extra-primary.jpg",
            position: 9,
            isPrimary: true,
          }),
        "23505",
      ),
    );
    await check(results, "image positions stay unique per product", () =>
      expectSqlState(
        () =>
          db.insert(productImages).values({
            productId: seedIds.dal,
            objectKey: "catalog/toor-dal/duplicate-position.jpg",
            deliveryPath: "/catalog/toor-dal/duplicate-position.jpg",
            position: 0,
            isPrimary: false,
          }),
        "23505",
      ),
    );
    await check(results, "a second product image can be stored", () =>
      rollbackAfter(db, async (tx) => {
        await tx.insert(productImages).values({
          productId: seedIds.atta,
          objectKey: "catalog/wheat-atta/detail.jpg",
          deliveryPath: "/catalog/wheat-atta/detail.jpg",
          altText: "Wheat atta detail",
          position: 1,
          isPrimary: false,
        });
      }),
    );
    await check(results, "deleting a product removes its image and attribute records", () =>
      rollbackAfter(db, async (tx) => {
        const productId = randomUUID();
        await tx.insert(products).values({
          id: productId,
          categoryId: seedIds.staples,
          name: "Temporary Product",
          sku: `TEMP-${productId.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          unit: "piece",
          packageSize: 1,
          packageLabel: "1 pc",
          publicationStatus: "draft",
        });
        const [image] = await tx
          .insert(productImages)
          .values({
            productId,
            objectKey: `catalog/temporary/${productId}.jpg`,
            deliveryPath: `/catalog/temporary/${productId}.jpg`,
            position: 0,
            isPrimary: true,
          })
          .returning({ id: productImages.id });
        const [attribute] = await tx
          .insert(productAttributes)
          .values({
            productId,
            name: "Note",
            value: "Temporary",
            position: 0,
          })
          .returning({ id: productAttributes.id });
        if (!image || !attribute) {
          throw new Error("temporary catalogue rows were not stored");
        }
        await tx.delete(products).where(eq(products.id, productId));
        const images = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(eq(productImages.id, image.id));
        const attributes = await tx
          .select({ id: productAttributes.id })
          .from(productAttributes)
          .where(eq(productAttributes.id, attribute.id));
        if (images.length !== 0 || attributes.length !== 0) {
          throw new Error("catalogue metadata survived product delete");
        }
      }),
    );
    await check(results, "duplicate barcode is rejected", () =>
      expectSqlState(
        () =>
          db.insert(products).values({
            categoryId: seedIds.staples,
            name: "Duplicate Barcode",
            sku: "TEMP-BARCODE",
            barcode: "8901000000031",
            unit: "kg",
            packageSize: 1,
            packageLabel: "1 kg",
          }),
        "23505",
      ),
    );
    await check(results, "barcode stays optional", () =>
      rollbackAfter(db, async (tx) => {
        await tx.insert(products).values([
          {
            categoryId: seedIds.produce,
            name: "Loose Mint",
            sku: "TEMP-MINT",
            unit: "g",
            packageSize: 100,
            packageLabel: "100 g",
          },
          {
            categoryId: seedIds.produce,
            name: "Loose Coriander",
            sku: "TEMP-CORIANDER",
            unit: "g",
            packageSize: 100,
            packageLabel: "100 g",
          },
        ]);
      }),
    );
    await check(results, "guest COD order can omit a customer account", () =>
      rollbackAfter(db, async (tx) => {
        const orderId = randomUUID();
        const phone = nextPhone();
        await tx.insert(orders).values({ ...orderRow(null, orderNumber()), id: orderId });
        await tx.insert(orderItems).values({
          orderId,
          productId: seedIds.dal,
          productName: "Toor Dal",
          sku: "DAL-TOOR-1KG",
          quantity: 1,
          unitPricePaise: 12000,
          lineTotalPaise: 12000,
        });
        await tx.insert(orderAddresses).values({
          orderId,
          recipientName: "Village Guest",
          phone,
          addressType: "other",
          line1: "House near the temple, Demo Village",
        });
        await tx.insert(orderStatusEvents).values({
          orderId,
          fromStatus: null,
          toStatus: "placed",
        });
        await tx.insert(payments).values({
          orderId,
          provider: "cod",
          amountPaise: 12000,
          status: "pending",
          idempotencyKey: `cod-${orderId.replaceAll("-", "")}`,
        });
      }),
    );
    await check(results, "image metadata rejects a storage key with spaces", () =>
      expectSqlState(
        () =>
          db.insert(productImages).values({
            productId: seedIds.onion,
            objectKey: "catalog/bad key.jpg",
            deliveryPath: "/catalog/bad-key.jpg",
            position: 1,
            isPrimary: false,
          }),
        "23514",
      ),
    );
  } finally {
    await closeDatabase();
  }

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function assertTables(db: Database): Promise<void> {
  const result = await db.execute<{ table_name: string }>(sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  const names = new Set(rowsOf<{ table_name: string }>(result).map((row) => row.table_name));
  const missing = expectedTables.filter((table) => !names.has(table));
  if (missing.length > 0) {
    throw new Error(`missing tables: ${missing.join(", ")}`);
  }
}

async function assertForeignKeys(db: Database): Promise<void> {
  const result = await db.execute<{
    table_name: string;
    column_name: string;
    delete_action: string;
  }>(sql`
    select src.relname as table_name, att.attname as column_name, con.confdeltype as delete_action
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_namespace ns on ns.oid = src.relnamespace
    join unnest(con.conkey) as cols(attnum) on true
    join pg_attribute att on att.attrelid = src.oid and att.attnum = cols.attnum
    where con.contype = 'f' and ns.nspname = 'public'
  `);
  const keys = rowsOf<{ table_name: string; column_name: string; delete_action: string }>(result);
  expectDelete(keys, "orders", "user_id", "r");
  expectDelete(keys, "orders", "store_id", "r");
  expectDelete(keys, "payments", "order_id", "r");
  expectDelete(keys, "order_items", "order_id", "r");
  expectDelete(keys, "order_addresses", "order_id", "r");
  expectDelete(keys, "order_addresses", "source_address_id", "n");
  expectDelete(keys, "order_status_events", "order_id", "r");
  expectDelete(keys, "inventory_movements", "store_product_id", "r");
  expectDelete(keys, "product_images", "product_id", "c");
  expectDelete(keys, "product_attributes", "product_id", "c");
  expectDelete(keys, "cart_items", "cart_id", "c");
  expectDelete(keys, "user_addresses", "user_id", "c");
  expectDelete(keys, "admin_sessions", "user_id", "c");
  expectDelete(keys, "guest_checkout_requests", "order_id", "r");
  expectDelete(keys, "app_settings", "updated_by_user_id", "n");
  expectDelete(keys, "image_cleanup", "product_id", "r");
}

async function assertGuestCheckoutSchema(db: Database): Promise<void> {
  const result = await db.execute<{ table_name: string; column_name: string; is_nullable: string }>(sql`
    select table_name, column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'orders' and column_name = 'user_id')
        or (table_name = 'order_addresses' and column_name in ('locality', 'city', 'state', 'postal_code', 'latitude', 'longitude'))
      )
  `);
  const columns = rowsOf<{ table_name: string; column_name: string; is_nullable: string }>(result);
  if (columns.length !== 7 || columns.some((column) => column.is_nullable !== "YES")) {
    throw new Error("guest checkout columns must be nullable");
  }
  const settings = await db.execute<{ value_paise: number }>(sql`
    select value_paise from app_settings where key = 'delivery_fee'
  `);
  const fee = rowsOf<{ value_paise: number }>(settings)[0];
  if (!fee || !Number.isInteger(Number(fee.value_paise)) || Number(fee.value_paise) < 0) {
    throw new Error("delivery_fee setting is missing or invalid");
  }
}

async function assertOrderTrackingSchema(db: Database): Promise<void> {
  const result = await db.execute<{ column_name: string; is_nullable: string }>(sql`
    select column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name in ('tracking_token_hash', 'tracking_token_expires_at', 'tracking_token_revoked_at')
  `);
  const columns = rowsOf<{ column_name: string; is_nullable: string }>(result);
  if (columns.length !== 3 || columns.some((column) => column.is_nullable !== "YES")) {
    throw new Error("order tracking columns must exist and stay nullable for orders created before tracking");
  }
}

async function assertImageCleanupSchema(db: Database): Promise<void> {
  const result = await db.execute<{ column_name: string; is_nullable: string }>(sql`
    select column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'image_cleanup'
      and column_name in (
        'id', 'operation', 'status', 'product_id', 'image_id', 'object_key',
        'attempt_count', 'max_attempts', 'next_retry_at', 'last_error', 'completed_at',
        'claim_token', 'idempotency_key', 'payload_hash'
      )
  `);
  const columns = rowsOf<{ column_name: string; is_nullable: string }>(result);
  if (columns.length !== 14) {
    throw new Error(`image_cleanup is missing columns, found ${columns.map((column) => column.column_name).join(", ")}`);
  }
  const required = columns.filter((column) =>
    ["id", "operation", "status", "product_id", "image_id", "object_key", "attempt_count", "max_attempts"].includes(
      column.column_name,
    ),
  );
  if (required.some((column) => column.is_nullable !== "NO")) {
    throw new Error("image_cleanup required columns must be not null");
  }
}

async function assertAdminAuth(db: Database): Promise<void> {
  const result = await db.execute<{ is_nullable: string }>(sql`
    select is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'password_hash'
  `);
  const column = rowsOf<{ is_nullable: string }>(result)[0];
  if (!column || column.is_nullable !== "YES") {
    throw new Error("users.password_hash must exist and stay nullable");
  }
}

async function assertConstraintKinds(db: Database): Promise<void> {
  const result = await db.execute<{ contype: string }>(sql`
    select contype
    from pg_constraint con
    join pg_namespace ns on ns.oid = con.connamespace
    where ns.nspname = 'public'
  `);
  const types = rowsOf<{ contype: string }>(result).map((row) => row.contype);
  if (!types.includes("f") || !types.includes("u") || !types.includes("c") || !types.includes("p")) {
    throw new Error(`unexpected constraint set: ${types.join("")}`);
  }
}

async function assertPartialIndexes(db: Database): Promise<void> {
  const result = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes where schemaname = 'public'
  `);
  const names = new Set(rowsOf<{ indexname: string }>(result).map((row) => row.indexname));
  const required = [
    "user_addresses_one_default_idx",
    "carts_one_active_per_user_idx",
    "stores_one_fulfilment_location_idx",
    "product_images_one_primary_idx",
    "payments_provider_order_idx",
    "payments_provider_payment_idx",
    "orders_tracking_token_hash_uidx",
    "image_cleanup_one_pending_delete_idx",
    "image_cleanup_active_object_key_idx",
    "image_cleanup_product_idempotency_uidx",
  ];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`missing indexes: ${missing.join(", ")}`);
  }
}

async function assertCentralInventory(db: Database): Promise<void> {
  const listings = await db
    .select({
      id: storeProducts.id,
      productId: storeProducts.productId,
      storeId: storeProducts.storeId,
      pricePaise: storeProducts.pricePaise,
      stockQuantity: storeProducts.stockQuantity,
    })
    .from(storeProducts);
  const expected = new Map<string, { pricePaise: number; stockQuantity: number }>([
    [seedIds.dal, { pricePaise: 12000, stockQuantity: 40 }],
    [seedIds.atta, { pricePaise: 25000, stockQuantity: 25 }],
    [seedIds.milk, { pricePaise: 5600, stockQuantity: 60 }],
    [seedIds.tomato, { pricePaise: 4000, stockQuantity: 30 }],
    [seedIds.onion, { pricePaise: 3000, stockQuantity: 50 }],
  ]);
  if (listings.length !== expected.size) {
    throw new Error(`expected ${expected.size} central listings, found ${listings.length}`);
  }
  const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
  for (const listing of listings) {
    const match = expected.get(listing.productId);
    if (
      !match ||
      listing.storeId !== seedIds.fulfilment ||
      listing.pricePaise !== match.pricePaise ||
      listing.stockQuantity !== match.stockQuantity ||
      !Number.isInteger(listing.pricePaise)
    ) {
      throw new Error("a product does not have one central integer-paise price and stock record");
    }
  }

  const movements = await db
    .select({
      storeProductId: inventoryMovements.storeProductId,
      quantityDelta: inventoryMovements.quantityDelta,
      stockAfter: inventoryMovements.stockAfter,
    })
    .from(inventoryMovements);
  for (const listing of listings) {
    const opening = movements.find(
      (movement) =>
        movement.storeProductId === listing.id &&
        movement.quantityDelta === listing.stockQuantity &&
        movement.stockAfter === listing.stockQuantity &&
        Number.isInteger(movement.quantityDelta),
    );
    if (!opening) {
      throw new Error("inventory movement does not match a central listing");
    }
  }

  const locations = await db.select({ id: stores.id }).from(stores);
  if (locations.length !== 1 || locations[0]?.id !== seedIds.fulfilment) {
    throw new Error("expected one Ghartak fulfilment location");
  }
}

async function assertCatalogueImages(db: Database): Promise<void> {
  const images = await db
    .select({
      productId: productImages.productId,
      storageProvider: productImages.storageProvider,
      objectKey: productImages.objectKey,
      deliveryPath: productImages.deliveryPath,
      position: productImages.position,
      isPrimary: productImages.isPrimary,
    })
    .from(productImages);
  if (images.length !== 6) {
    throw new Error(`expected 6 catalogue images, found ${images.length}`);
  }
  const primaryCount = new Map<string, number>();
  for (const image of images) {
    if (image.storageProvider !== "r2" || image.position < 0) {
      throw new Error("image metadata is missing its storage provider or position");
    }
    if (!image.deliveryPath.startsWith("/") && !image.deliveryPath.startsWith("https://")) {
      throw new Error("image delivery path is not a path or https URL");
    }
    primaryCount.set(image.productId, (primaryCount.get(image.productId) ?? 0) + (image.isPrimary ? 1 : 0));
  }
  for (const count of primaryCount.values()) {
    if (count !== 1) {
      throw new Error("a product does not have exactly one primary image");
    }
  }
  const dalImages = images.filter((image) => image.productId === seedIds.dal);
  if (dalImages.length !== 2) {
    throw new Error("the demo product does not have multiple images");
  }
}

async function assertRollback(db: Database): Promise<void> {
  const phone = nextPhone();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values(userRow(phone));
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (rows.length !== 0) {
    throw new Error("rolled back user is still present");
  }
}

async function assertCommittedOrder(db: Database): Promise<void> {
  const userId = randomUUID();
  const orderId = randomUUID();
  const phone = nextPhone();
  const number = orderNumber();
  try {
    await withTransaction(db, async (tx) => {
      await tx.insert(users).values({ ...userRow(phone), id: userId });
      const [address] = await tx
        .insert(userAddresses)
        .values(addressRow(userId, true, "home"))
        .returning({ id: userAddresses.id });
      if (!address) {
        throw new Error("address insert returned no row");
      }
      await tx.insert(orders).values({ ...orderRow(userId, number), id: orderId });
      await tx.insert(orderItems).values({
        orderId,
        productId: seedIds.dal,
        productName: "Toor Dal",
        sku: "DAL-TOOR-1KG",
        quantity: 1,
        unitPricePaise: 12000,
        lineTotalPaise: 12000,
      });
      await tx.insert(orderAddresses).values({
        orderId,
        sourceAddressId: address.id,
        recipientName: "Schema Test",
        phone,
        addressType: "home",
        line1: "12 Market Road",
        locality: "Demo Village",
        city: "Demo Village",
        state: "Uttar Pradesh",
        postalCode: "226001",
        latitude: 26.5,
        longitude: 80.5,
      });
      await tx.insert(orderStatusEvents).values({
        orderId,
        fromStatus: null,
        toStatus: "placed",
      });
      await tx.insert(payments).values(paymentRow(orderId, `idem-${orderId}`));
    });

    const [saved] = await db
      .select({ totalPaise: orders.totalPaise })
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!saved || saved.totalPaise !== 12180) {
      throw new Error("committed order total was not readable");
    }

    await expectSqlState(() => db.delete(orders).where(eq(orders.id, orderId)), "23503");
  } finally {
    await withTransaction(db, async (tx) => {
      await tx.delete(payments).where(eq(payments.orderId, orderId));
      await tx.delete(orderStatusEvents).where(eq(orderStatusEvents.orderId, orderId));
      await tx.delete(orderAddresses).where(eq(orderAddresses.orderId, orderId));
      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await tx.delete(orders).where(eq(orders.id, orderId));
      await tx.delete(users).where(eq(users.id, userId));
    });
  }
}

async function assertStockRollback(db: Database): Promise<void> {
  const storeProductId = "10000000-0000-4000-8000-000000000041";
  const [before] = await db
    .select({ stockQuantity: storeProducts.stockQuantity })
    .from(storeProducts)
    .where(eq(storeProducts.id, storeProductId));
  if (!before) {
    throw new Error("seed stock row is missing");
  }
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(storeProducts)
        .set({ stockQuantity: before.stockQuantity - 1 })
        .where(eq(storeProducts.id, storeProductId));
      await tx.insert(inventoryMovements).values({
        storeProductId,
        movementType: "removal",
        quantityDelta: -1,
        stockAfter: before.stockQuantity - 1,
        reason: "rollback-check",
      });
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
  const [after] = await db
    .select({ stockQuantity: storeProducts.stockQuantity })
    .from(storeProducts)
    .where(eq(storeProducts.id, storeProductId));
  if (!after || after.stockQuantity !== before.stockQuantity) {
    throw new Error("stock change survived rollback");
  }
}

async function rollbackAfter(
  db: Database,
  callback: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await callback(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
}

async function expectSqlState(callback: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await callback();
  } catch (error) {
    const actual = sqlState(error);
    if (actual !== expected) {
      throw new Error(`expected SQLSTATE ${expected} but received ${actual ?? "unknown"}`);
    }
    return;
  }
  throw new Error(`expected SQLSTATE ${expected} but the statement succeeded`);
}

function assertSameValues(actual: readonly string[], expected: readonly string[]): void {
  if (actual.join("|") !== expected.join("|")) {
    throw new Error(`enum drift: ${actual.join("|")} !== ${expected.join("|")}`);
  }
}

function expectDelete(
  keys: Array<{ table_name: string; column_name: string; delete_action: string }>,
  tableName: string,
  columnName: string,
  deleteAction: string,
): void {
  const match = keys.find((key) => key.table_name === tableName && key.column_name === columnName);
  if (!match || match.delete_action !== deleteAction) {
    throw new Error(
      `${tableName}.${columnName} delete action is ${match?.delete_action ?? "missing"}, expected ${deleteAction}`,
    );
  }
}

function rowsOf<T extends QueryRow>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (typeof result === "object" && result !== null && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as T[];
  }
  throw new Error("unexpected query result");
}

function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      typeof current.code === "string" &&
      /^[0-9A-Z]{5}$/.test(current.code)
    ) {
      return current.code;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

let phoneSequence = 100;

function nextPhone(): string {
  phoneSequence += 1;
  return `+91981000${String(phoneSequence).padStart(4, "0")}`;
}

function orderNumber(): string {
  return `GT-TEST-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

function userRow(phone: string) {
  return {
    name: "Schema Test",
    phone,
    email: `${phone.slice(1)}@example.com`,
    status: "active" as const,
  };
}

function addressRow(userId: string, isDefault: boolean, addressType: "home" | "work") {
  return {
    userId,
    addressType,
    contactName: "Schema Test",
    phone: "+919810009999",
    line1: "12 Market Road",
    locality: "Demo Village",
    city: "Demo Village",
    state: "Uttar Pradesh",
    postalCode: "226001",
    latitude: 26.5,
    longitude: 80.5,
    isDefault,
  };
}

function orderRow(userId: string | null, number: string) {
  return {
    orderNumber: number,
    userId,
    storeId: seedIds.fulfilment,
    subtotalPaise: 10001,
    discountPaise: 1,
    deliveryFeePaise: 2000,
    taxPaise: 180,
    totalPaise: 12180,
    paymentMethod: "upi" as const,
    currency: "INR" as const,
  };
}

function paymentRow(orderId: string, idempotencyKey: string) {
  return {
    orderId,
    provider: "razorpay",
    providerOrderId: `order_${idempotencyKey}`,
    amountPaise: 12180,
    currency: "INR" as const,
    status: "pending" as const,
    idempotencyKey,
  };
}

async function check(results: CheckResult[], name: string, callback: () => Promise<void> | void): Promise<void> {
  try {
    await callback();
    results.push({ name, passed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "check failed";
    results.push({
      name,
      passed: false,
      detail: message.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted-url]"),
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Verification failed";
    console.error(message.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted-url]"));
    process.exitCode = 1;
  });
}
