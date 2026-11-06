import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { closeDatabase, openDatabase, withTransaction, type Database } from "./client.js";
import {
  categories,
  inventoryMovements,
  productAttributes,
  productImages,
  products,
  serviceZones,
  storeProducts,
  stores,
} from "./schema/index.js";

export const seedIds = {
  zone: "10000000-0000-4000-8000-000000000001",
  fulfilment: "10000000-0000-4000-8000-000000000011",
  staples: "10000000-0000-4000-8000-000000000021",
  dairy: "10000000-0000-4000-8000-000000000022",
  produce: "10000000-0000-4000-8000-000000000023",
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

const attributeIds = {
  dalVariety: "10000000-0000-4000-8000-000000000091",
  milkFat: "10000000-0000-4000-8000-000000000092",
} as const;

type SeedSummary = {
  serviceZones: number;
  stores: number;
  categories: number;
  products: number;
  storeProducts: number;
  inventoryMovements: number;
  productImages: number;
  productAttributes: number;
};

export async function seedDatabase(db: Database): Promise<SeedSummary> {
  return withTransaction(db, async (tx) => {
    const zoneRows = await tx
      .insert(serviceZones)
      .values({
        id: seedIds.zone,
        name: "Demo Village",
        slug: "demo-village",
        kind: "village",
        state: "Uttar Pradesh",
        country: "IN",
        isActive: true,
      })
      .onConflictDoNothing({ target: serviceZones.id })
      .returning({ id: serviceZones.id });

    const storeRows = await tx
      .insert(stores)
      .values({
        id: seedIds.fulfilment,
        serviceZoneId: seedIds.zone,
        name: "Ghartak",
        contactPhone: "+919876500001",
        contactEmail: "warehouse@ghartak.example",
        line1: "1 Warehouse Lane",
        landmark: "Village market edge",
        locality: "Demo Village",
        city: "Demo Village",
        state: "Uttar Pradesh",
        postalCode: "226001",
        latitude: 26.5,
        longitude: 80.5,
        status: "active",
      })
      .onConflictDoNothing({ target: stores.id })
      .returning({ id: stores.id });

    const categoryRows = await tx
      .insert(categories)
      .values([
        {
          id: seedIds.staples,
          name: "Staples",
          slug: "staples",
          description: "Pulses, flour, and everyday grains",
          isActive: true,
        },
        {
          id: seedIds.dairy,
          name: "Dairy",
          slug: "dairy",
          description: "Milk and dairy staples",
          isActive: true,
        },
        {
          id: seedIds.produce,
          name: "Produce",
          slug: "produce",
          description: "Fresh vegetables",
          isActive: true,
        },
      ])
      .onConflictDoNothing({ target: categories.id })
      .returning({ id: categories.id });

    const productRows = await tx
      .insert(products)
      .values([
        {
          id: seedIds.dal,
          categoryId: seedIds.staples,
          name: "Toor Dal",
          brand: "Ghartak Staples",
          description: "Split pigeon peas",
          sku: "DAL-TOOR-1KG",
          barcode: "8901000000031",
          publicationStatus: "published",
          unit: "kg",
          packageSize: 1,
          packageLabel: "1 kg",
          isActive: true,
        },
        {
          id: seedIds.atta,
          categoryId: seedIds.staples,
          name: "Wheat Atta",
          brand: "Ghartak Staples",
          description: "Whole wheat flour",
          sku: "ATTA-5KG",
          publicationStatus: "published",
          unit: "kg",
          packageSize: 5,
          packageLabel: "5 kg",
          isActive: true,
        },
        {
          id: seedIds.milk,
          categoryId: seedIds.dairy,
          name: "Toned Milk",
          brand: "Ghartak Dairy",
          description: "Pasteurised toned milk",
          sku: "MILK-1L",
          barcode: "8901000000032",
          publicationStatus: "published",
          unit: "litre",
          packageSize: 1,
          packageLabel: "1 L",
          isActive: true,
        },
        {
          id: seedIds.tomato,
          categoryId: seedIds.produce,
          name: "Tomato",
          description: "Fresh tomatoes",
          sku: "VEG-TOMATO-1KG",
          publicationStatus: "published",
          unit: "kg",
          packageSize: 1,
          packageLabel: "1 kg",
          isActive: true,
        },
        {
          id: seedIds.onion,
          categoryId: seedIds.produce,
          name: "Onion",
          description: "Fresh onions",
          sku: "VEG-ONION-1KG",
          publicationStatus: "published",
          unit: "kg",
          packageSize: 1,
          packageLabel: "1 kg",
          isActive: true,
        },
      ])
      .onConflictDoNothing({ target: products.id })
      .returning({ id: products.id });

    await tx
      .update(products)
      .set({ brand: "Ghartak Staples", barcode: "8901000000031", publicationStatus: "published" })
      .where(eq(products.id, seedIds.dal));
    await tx
      .update(products)
      .set({ brand: "Ghartak Staples", barcode: null, publicationStatus: "published" })
      .where(eq(products.id, seedIds.atta));
    await tx
      .update(products)
      .set({ brand: "Ghartak Dairy", barcode: "8901000000032", publicationStatus: "published" })
      .where(eq(products.id, seedIds.milk));
    await tx
      .update(products)
      .set({ brand: null, barcode: null, publicationStatus: "published" })
      .where(eq(products.id, seedIds.tomato));
    await tx
      .update(products)
      .set({ brand: null, barcode: null, publicationStatus: "published" })
      .where(eq(products.id, seedIds.onion));

    const storeProductRows = await tx
      .insert(storeProducts)
      .values([
        storeProduct(storeProductIds.dal, seedIds.fulfilment, seedIds.dal, 12000, 40),
        storeProduct(storeProductIds.atta, seedIds.fulfilment, seedIds.atta, 25000, 25),
        storeProduct(storeProductIds.milk, seedIds.fulfilment, seedIds.milk, 5600, 60),
        storeProduct(storeProductIds.tomato, seedIds.fulfilment, seedIds.tomato, 4000, 30),
        storeProduct(storeProductIds.onion, seedIds.fulfilment, seedIds.onion, 3000, 50),
      ])
      .onConflictDoNothing({ target: storeProducts.id })
      .returning({ id: storeProducts.id });

    const movementRows = await tx
      .insert(inventoryMovements)
      .values([
        movement("10000000-0000-4000-8000-000000000061", storeProductIds.dal, 40),
        movement("10000000-0000-4000-8000-000000000062", storeProductIds.atta, 25),
        movement("10000000-0000-4000-8000-000000000063", storeProductIds.milk, 60),
        movement("10000000-0000-4000-8000-000000000064", storeProductIds.tomato, 30),
        movement("10000000-0000-4000-8000-000000000065", storeProductIds.onion, 50),
      ])
      .onConflictDoNothing({ target: inventoryMovements.id })
      .returning({ id: inventoryMovements.id });

    const imageRows = await tx
      .insert(productImages)
      .values([
        image(imageIds.dalPrimary, seedIds.dal, "catalog/toor-dal/primary.jpg", "Toor dal pack", 0, true),
        image(imageIds.dalDetail, seedIds.dal, "catalog/toor-dal/detail.jpg", "Toor dal detail", 1, false),
        image(imageIds.attaPrimary, seedIds.atta, "catalog/wheat-atta/primary.jpg", "Wheat atta pack", 0, true),
        image(imageIds.milkPrimary, seedIds.milk, "catalog/toned-milk/primary.jpg", "Toned milk pack", 0, true),
        image(imageIds.tomatoPrimary, seedIds.tomato, "catalog/tomato/primary.jpg", "Tomatoes", 0, true),
        image(imageIds.onionPrimary, seedIds.onion, "catalog/onion/primary.jpg", "Onions", 0, true),
      ])
      .onConflictDoNothing({ target: productImages.id })
      .returning({ id: productImages.id });

    const attributeRows = await tx
      .insert(productAttributes)
      .values([
        {
          id: attributeIds.dalVariety,
          productId: seedIds.dal,
          name: "Variety",
          value: "Toor",
          position: 0,
        },
        {
          id: attributeIds.milkFat,
          productId: seedIds.milk,
          name: "Fat",
          value: "Toned",
          position: 0,
        },
      ])
      .onConflictDoNothing({ target: productAttributes.id })
      .returning({ id: productAttributes.id });

    return {
      serviceZones: zoneRows.length,
      stores: storeRows.length,
      categories: categoryRows.length,
      products: productRows.length,
      storeProducts: storeProductRows.length,
      inventoryMovements: movementRows.length,
      productImages: imageRows.length,
      productAttributes: attributeRows.length,
    };
  });
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

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const db = openDatabase(connectionString);
  try {
    const summary = await seedDatabase(db);
    console.log(JSON.stringify(summary));
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Seed failed";
    console.error(message.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted-url]"));
    process.exitCode = 1;
  });
}
