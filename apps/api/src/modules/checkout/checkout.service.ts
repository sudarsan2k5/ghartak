import {
  guestCheckoutResponseSchema,
  guestCheckoutStoredResponseSchema,
  type GuestCheckoutRequest,
  type GuestCheckoutResponse,
} from "@ghartak/contracts";
import {
  appSettings,
  categories,
  guestCheckoutRequests,
  initialOrderStatus,
  inventoryMovements,
  orderAddresses,
  orderItems,
  orders,
  orderStatusEvents,
  payments,
  products,
  storeProducts,
  withTransaction,
  type Database,
} from "@ghartak/database";
import { createHash, randomBytes } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { HttpError } from "../../http/errors.js";
import { nextAvailability } from "../admin/inventory/inventory.service.js";
import {
  hashTrackingToken,
  issueTrackingToken,
  trackingTokenExpiresAt,
} from "../orders/tracking-token.js";

const deliveryFeeKey = "delivery_fee";

export function createCheckoutService(db: Database, options: { trackingTokenSecret: string }) {
  if (options.trackingTokenSecret.length < 32) {
    throw new Error("ORDER_TRACKING_SECRET is too short");
  }
  return {
    async createGuestOrder(input: GuestCheckoutRequest): Promise<GuestCheckoutResponse> {
      const items = mergeItems(input.items);
      const requestHash = hashCheckoutRequest({
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        deliveryAddress: input.deliveryAddress,
        items,
      });

      return withTransaction(db, async (tx) => {
        await tx
          .insert(guestCheckoutRequests)
          .values({
            idempotencyKey: input.idempotencyKey,
            requestHash,
            response: {},
          })
          .onConflictDoNothing({ target: guestCheckoutRequests.idempotencyKey });

        const [existing] = await tx
          .select()
          .from(guestCheckoutRequests)
          .where(eq(guestCheckoutRequests.idempotencyKey, input.idempotencyKey))
          .for("update");

        if (!existing) {
          throw new HttpError(500, "Checkout could not be started");
        }
        if (existing.requestHash !== requestHash) {
          throw new HttpError(409, "This checkout key was already used with a different request", {
            code: "idempotency_conflict",
          });
        }
        if (existing.orderId) {
          return replayCheckoutResponse(tx, existing.orderId, existing.response, options.trackingTokenSecret);
        }

        const productIds = items.map((item) => item.productId);
        const listings = await tx
          .select({
            listingId: storeProducts.id,
            productId: products.id,
            storeId: storeProducts.storeId,
            name: products.name,
            sku: products.sku,
            publicationStatus: products.publicationStatus,
            productActive: products.isActive,
            categoryActive: categories.isActive,
            pricePaise: storeProducts.pricePaise,
            stockQuantity: storeProducts.stockQuantity,
            availability: storeProducts.availability,
          })
          .from(storeProducts)
          .innerJoin(products, eq(products.id, storeProducts.productId))
          .innerJoin(categories, eq(categories.id, products.categoryId))
          .where(inArray(products.id, productIds))
          .orderBy(asc(products.id))
          .for("update");

        const listingByProduct = new Map(listings.map((row) => [row.productId, row]));
        const lines: Array<{
          productId: string;
          listingId: string;
          storeId: string;
          productName: string;
          sku: string;
          quantity: number;
          unitPricePaise: number;
          lineTotalPaise: number;
          stockAfter: number;
          availability: "available" | "unavailable" | "out_of_stock";
        }> = [];

        for (const item of items) {
          const listing = listingByProduct.get(item.productId);
          if (!listing) {
            throw new HttpError(409, "This product is not available", {
              code: "product_unavailable",
              productId: item.productId,
            });
          }
          if (
            listing.publicationStatus !== "published" ||
            !listing.productActive ||
            !listing.categoryActive ||
            listing.availability !== "available"
          ) {
            throw new HttpError(409, "This product is not available", {
              code: "product_unavailable",
              productId: item.productId,
            });
          }
          if (listing.stockQuantity < item.quantity) {
            throw new HttpError(409, "There is not enough stock for this product", {
              code: "insufficient_stock",
              productId: item.productId,
            });
          }
          const unitPricePaise = listing.pricePaise;
          const lineTotalPaise = unitPricePaise * item.quantity;
          const stockAfter = listing.stockQuantity - item.quantity;
          lines.push({
            productId: listing.productId,
            listingId: listing.listingId,
            storeId: listing.storeId,
            productName: listing.name,
            sku: listing.sku,
            quantity: item.quantity,
            unitPricePaise,
            lineTotalPaise,
            stockAfter,
            availability: nextAvailability(listing.availability, stockAfter),
          });
        }

        const [fee] = await tx
          .select({ valuePaise: appSettings.valuePaise })
          .from(appSettings)
          .where(eq(appSettings.key, deliveryFeeKey))
          .for("update");
        const deliveryFeePaise = fee?.valuePaise ?? 0;
        const subtotalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
        const totalPaise = subtotalPaise + deliveryFeePaise;
        if (totalPaise <= 0 || totalPaise > 2_147_483_647) {
          throw new HttpError(409, "This order cannot be placed");
        }

        const storeId = lines[0]?.storeId;
        if (!storeId || lines.some((line) => line.storeId !== storeId)) {
          throw new HttpError(500, "Checkout could not be completed");
        }

        const created = await insertOrder(tx, {
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          deliveryAddress: input.deliveryAddress,
          storeId,
          lines,
          subtotalPaise,
          deliveryFeePaise,
          totalPaise,
          trackingTokenSecret: options.trackingTokenSecret,
        });

        await tx
          .update(guestCheckoutRequests)
          .set({
            orderId: created.orderId,
            response: created.storedResponse,
          })
          .where(eq(guestCheckoutRequests.idempotencyKey, input.idempotencyKey));

        return created.response;
      });
    },
  };
}

function mergeItems(items: GuestCheckoutRequest["items"]): Array<{ productId: string; quantity: number }> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const next = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (next > 999) {
      throw new HttpError(400, "items: Too much of one product in this order");
    }
    quantities.set(item.productId, next);
  }
  return [...quantities.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

function hashCheckoutRequest(input: {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: Array<{ productId: string; quantity: number }>;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function insertOrder(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: {
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    storeId: string;
    lines: Array<{
      productId: string;
      listingId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitPricePaise: number;
      lineTotalPaise: number;
      stockAfter: number;
      availability: "available" | "unavailable" | "out_of_stock";
    }>;
    subtotalPaise: number;
    deliveryFeePaise: number;
    totalPaise: number;
    trackingTokenSecret: string;
  },
): Promise<{ orderId: string; storedResponse: Record<string, unknown>; response: GuestCheckoutResponse }> {
  const orderNumber = nextOrderNumber();
  const [order] = await tx
    .insert(orders)
    .values({
      orderNumber,
      userId: null,
      storeId: input.storeId,
      status: initialOrderStatus,
      subtotalPaise: input.subtotalPaise,
      discountPaise: 0,
      deliveryFeePaise: input.deliveryFeePaise,
      taxPaise: 0,
      totalPaise: input.totalPaise,
      paymentMethod: "cash_on_delivery",
      paymentStatus: "pending",
    })
    .returning({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt,
    });
  if (!order || order.paymentMethod !== "cash_on_delivery") {
    throw new HttpError(500, "Checkout could not be completed");
  }

  const trackingToken = issueTrackingToken(input.trackingTokenSecret, order.id);
  await tx
    .update(orders)
    .set({
      trackingTokenHash: hashTrackingToken(trackingToken),
      trackingTokenExpiresAt: trackingTokenExpiresAt(order.createdAt),
    })
    .where(eq(orders.id, order.id));

  await tx.insert(orderItems).values(
    input.lines.map((line) => ({
      orderId: order.id,
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      lineTotalPaise: line.lineTotalPaise,
    })),
  );

  await tx.insert(orderAddresses).values({
    orderId: order.id,
    recipientName: input.customerName,
    phone: input.customerPhone,
    addressType: "other",
    line1: input.deliveryAddress,
  });

  await tx.insert(payments).values({
    orderId: order.id,
    provider: "cod",
    amountPaise: input.totalPaise,
    status: "pending",
    idempotencyKey: paymentIdempotencyKey(order.id),
  });

  await tx.insert(orderStatusEvents).values({
    orderId: order.id,
    fromStatus: null,
    toStatus: initialOrderStatus,
    note: "Guest COD order placed",
    actorUserId: null,
  });

  for (const line of input.lines) {
    await tx
      .update(storeProducts)
      .set({
        stockQuantity: line.stockAfter,
        availability: line.availability,
      })
      .where(eq(storeProducts.id, line.listingId));
    await tx.insert(inventoryMovements).values({
      storeProductId: line.listingId,
      movementType: "removal",
      quantityDelta: -line.quantity,
      stockAfter: line.stockAfter,
      reason: `guest_order:${order.orderNumber}`,
      actorUserId: null,
    });
  }

  const response = guestCheckoutResponseSchema.parse({
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: "cash_on_delivery",
    paymentStatus: order.paymentStatus,
    customerName: input.customerName,
    items: input.lines.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      lineTotalPaise: line.lineTotalPaise,
    })),
    subtotalPaise: input.subtotalPaise,
    deliveryFeePaise: input.deliveryFeePaise,
    totalPaise: input.totalPaise,
    createdAt: order.createdAt.toISOString(),
    trackingToken,
  });
  return { orderId: order.id, storedResponse: storedCheckoutResponse(response), response };
}

async function replayCheckoutResponse(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  orderId: string,
  stored: unknown,
  trackingTokenSecret: string,
): Promise<GuestCheckoutResponse> {
  const trackingToken = issueTrackingToken(trackingTokenSecret, orderId);
  await persistTrackingHash(tx, orderId, trackingToken);
  return guestCheckoutResponseSchema.parse({
    ...guestCheckoutStoredResponseSchema.parse(stored),
    trackingToken,
  });
}

async function persistTrackingHash(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  orderId: string,
  trackingToken: string,
): Promise<void> {
  const tokenHash = hashTrackingToken(trackingToken);
  const [order] = await tx
    .select({
      trackingTokenHash: orders.trackingTokenHash,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  if (!order) {
    throw new HttpError(500, "Checkout could not be completed");
  }
  if (!order.trackingTokenHash) {
    await tx
      .update(orders)
      .set({
        trackingTokenHash: tokenHash,
        trackingTokenExpiresAt: trackingTokenExpiresAt(order.createdAt),
      })
      .where(eq(orders.id, orderId));
    return;
  }
  if (order.trackingTokenHash !== tokenHash) {
    throw new HttpError(500, "Checkout could not be completed");
  }
}

function storedCheckoutResponse(response: GuestCheckoutResponse): Record<string, unknown> {
  const { trackingToken: _trackingToken, ...stored } = response;
  return guestCheckoutStoredResponseSchema.parse(stored);
}

function nextOrderNumber(): string {
  return `GT-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function paymentIdempotencyKey(orderId: string): string {
  return `cod-${orderId.replaceAll("-", "")}`;
}
