import type { AdminPriceUpdate, AdminStockChange } from "@ghartak/contracts";
import {
  inventoryMovements,
  storeProducts,
  withTransaction,
  type Database,
} from "@ghartak/database";
import { eq } from "drizzle-orm";
import { HttpError } from "../../../http/errors.js";

type Availability = "available" | "unavailable" | "out_of_stock";

export function createAdminInventoryService(db: Database) {
  return {
    async updatePrice(productId: string, input: AdminPriceUpdate) {
      return withTransaction(db, async (tx) => {
        const listing = await lockListing(tx, productId);
        await tx
          .update(storeProducts)
          .set({ pricePaise: input.pricePaise })
          .where(eq(storeProducts.id, listing.id));
        return {
          productId,
          inventory: {
            pricePaise: input.pricePaise,
            stockQuantity: listing.stockQuantity,
            availability: listing.availability,
          },
        };
      });
    },

    async changeStock(productId: string, input: AdminStockChange, actorUserId: string) {
      return withTransaction(db, async (tx) => {
        const listing = await lockListing(tx, productId);
        const delta = input.type === "adjustment" ? input.quantityDelta : input.type === "addition" ? input.quantity : -input.quantity;
        const stockAfter = listing.stockQuantity + delta;
        if (stockAfter < 0) {
          throw new HttpError(409, "Stock cannot become negative");
        }
        const availability = nextAvailability(listing.availability, stockAfter);
        await tx
          .update(storeProducts)
          .set({ stockQuantity: stockAfter, availability })
          .where(eq(storeProducts.id, listing.id));
        const [movement] = await tx
          .insert(inventoryMovements)
          .values({
            storeProductId: listing.id,
            movementType: input.type,
            quantityDelta: delta,
            stockAfter,
            reason: input.reason,
            actorUserId,
          })
          .returning({
            id: inventoryMovements.id,
            movementType: inventoryMovements.movementType,
            quantityDelta: inventoryMovements.quantityDelta,
            stockAfter: inventoryMovements.stockAfter,
            reason: inventoryMovements.reason,
          });
        if (!movement) {
          throw new HttpError(500, "Stock movement could not be recorded");
        }
        return {
          productId,
          inventory: { pricePaise: listing.pricePaise, stockQuantity: stockAfter, availability },
          movement,
        };
      });
    },
  };
}

export function nextAvailability(current: Availability, stockAfter: number): Availability {
  if (stockAfter === 0 && current === "available") {
    return "out_of_stock";
  }
  if (stockAfter > 0 && current === "out_of_stock") {
    return "available";
  }
  return current;
}

async function lockListing(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  productId: string,
) {
  const [listing] = await tx
    .select({
      id: storeProducts.id,
      pricePaise: storeProducts.pricePaise,
      stockQuantity: storeProducts.stockQuantity,
      availability: storeProducts.availability,
    })
    .from(storeProducts)
    .where(eq(storeProducts.productId, productId))
    .for("update")
    .limit(1);
  if (!listing) {
    throw new HttpError(404, "Product not found");
  }
  return listing;
}
