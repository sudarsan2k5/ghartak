// Sample products for db:verify and API tests only. They are never part of the seed:
// each caller inserts them for its run and removes them afterwards.
import { inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { inventoryMovements, imageCleanup, productImages, products, storeProducts } from "./schema/index.js";
import { seedIds } from "./seed.js";

export const sampleProductIds = {
  dal: "10000000-0000-4000-8000-000000000031",
  atta: "10000000-0000-4000-8000-000000000032",
  milk: "10000000-0000-4000-8000-000000000033",
  tomato: "10000000-0000-4000-8000-000000000034",
  onion: "10000000-0000-4000-8000-000000000035",
} as const;

const storeProductIds = {
  dal: "10000000-0000-4000-8000-000000000041",
  atta: "10000000-0000-4000-8000-000000000042",
  milk: "10000000-0000-4000-8000-000000000043",
  tomato: "10000000-0000-4000-8000-000000000044",
  onion: "10000000-0000-4000-8000-000000000045",
} as const;

const imageIds = {
  dalPrimary: "10000000-0000-4000-8000-000000000081",
  dalDetail: "10000000-0000-4000-8000-000000000082",
  attaPrimary: "10000000-0000-4000-8000-000000000083",
  milkPrimary: "10000000-0000-4000-8000-000000000084",
  tomatoPrimary: "10000000-0000-4000-8000-000000000085",
  onionPrimary: "10000000-0000-4000-8000-000000000086",
} as const;

export async function insertSampleCatalogue(db: Database): Promise<void> {
  await removeSampleCatalogue(db);
    await db
      .insert(products)
      .values([
        {
          id: sampleProductIds.dal,
          categoryId: seedIds.staples,
          name: "Toor Dal",
          brand: "Ghartak Staples",
          description: "Split pigeon peas",
          publicationStatus: "published",
          unit: "kg",
          packageSize: 1,
          packageLabel: "1 kg",
          isActive: true,
        },
        {
          id: sampleProductIds.atta,
          categoryId: seedIds.staples,
          name: "Wheat Atta",
          brand: "Ghartak Staples",
          description: "Whole wheat flour",
          publicationStatus: "published",
          unit: "kg",
          packageSize: 5,
          packageLabel: "5 kg",
          isActive: true,
        },
        {
          id: sampleProductIds.milk,
          categoryId: seedIds.dairy,
          name: "Toned Milk",
          brand: "Ghartak Dairy",
          description: "Pasteurised toned milk",
          publicationStatus: "published",
          unit: "litre",
          packageSize: 1,
          packageLabel: "1 L",
          isActive: true,
        },
        {
          id: sampleProductIds.tomato,
          categoryId: seedIds.produce,
          name: "Tomato",
          description: "Fresh tomatoes",
          publicationStatus: "published",
          unit: "kg",
          packageSize: 1,
          packageLabel: "1 kg",
          isActive: true,
        },
        {
          id: sampleProductIds.onion,
          categoryId: seedIds.produce,
          name: "Onion",
          description: "Fresh onions",
          publicationStatus: "published",
          unit: "kg",
          packageSize: 1,
          packageLabel: "1 kg",
          isActive: true,
        },
      ]);

    await db
      .insert(storeProducts)
      .values([
        storeProduct(storeProductIds.dal, seedIds.fulfilment, sampleProductIds.dal, 12000, 40),
        storeProduct(storeProductIds.atta, seedIds.fulfilment, sampleProductIds.atta, 25000, 25),
        storeProduct(storeProductIds.milk, seedIds.fulfilment, sampleProductIds.milk, 5600, 60),
        storeProduct(storeProductIds.tomato, seedIds.fulfilment, sampleProductIds.tomato, 4000, 30),
        storeProduct(storeProductIds.onion, seedIds.fulfilment, sampleProductIds.onion, 3000, 50),
      ]);

    await db
      .insert(inventoryMovements)
      .values([
        movement("10000000-0000-4000-8000-000000000061", storeProductIds.dal, 40),
        movement("10000000-0000-4000-8000-000000000062", storeProductIds.atta, 25),
        movement("10000000-0000-4000-8000-000000000063", storeProductIds.milk, 60),
        movement("10000000-0000-4000-8000-000000000064", storeProductIds.tomato, 30),
        movement("10000000-0000-4000-8000-000000000065", storeProductIds.onion, 50),
      ]);

    await db
      .insert(productImages)
      .values([
        image(imageIds.dalPrimary, sampleProductIds.dal, "catalog/toor-dal/primary.jpg", "Toor dal pack", 0, true),
        image(imageIds.dalDetail, sampleProductIds.dal, "catalog/toor-dal/detail.jpg", "Toor dal detail", 1, false),
        image(imageIds.attaPrimary, sampleProductIds.atta, "catalog/wheat-atta/primary.jpg", "Wheat atta pack", 0, true),
        image(imageIds.milkPrimary, sampleProductIds.milk, "catalog/toned-milk/primary.jpg", "Toned milk pack", 0, true),
        image(imageIds.tomatoPrimary, sampleProductIds.tomato, "catalog/tomato/primary.jpg", "Tomatoes", 0, true),
        image(imageIds.onionPrimary, sampleProductIds.onion, "catalog/onion/primary.jpg", "Onions", 0, true),
      ]);
}

export async function removeSampleCatalogue(db: Database): Promise<void> {
  const ids = Object.values(sampleProductIds);
  const listings = Object.values(storeProductIds);
  await db.delete(inventoryMovements).where(inArray(inventoryMovements.storeProductId, listings));
  await db.delete(storeProducts).where(inArray(storeProducts.id, listings));
  await db.delete(imageCleanup).where(inArray(imageCleanup.productId, ids));
  await db.delete(productImages).where(inArray(productImages.productId, ids));
  await db.delete(products).where(inArray(products.id, ids));
}

function image(
  id: string,
  productId: string,
  objectKey: string,
  altText: string,
  position: number,
  isPrimary: boolean,
) {
  return {
    id,
    productId,
    storageProvider: "r2" as const,
    objectKey,
    deliveryPath: `/${objectKey}`,
    altText,
    position,
    isPrimary,
  };
}

function storeProduct(
  id: string,
  storeId: string,
  productId: string,
  pricePaise: number,
  stockQuantity: number,
) {
  return {
    id,
    storeId,
    productId,
    pricePaise,
    stockQuantity,
    availability: "available" as const,
  };
}

function movement(id: string, storeProductId: string, quantity: number) {
  return {
    id,
    storeProductId,
    movementType: "addition" as const,
    quantityDelta: quantity,
    stockAfter: quantity,
    reason: "opening_stock",
  };
}
