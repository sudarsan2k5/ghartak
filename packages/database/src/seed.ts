import { pathToFileURL } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { closeDatabase, openDatabase, withTransaction, type Database } from "./client.js";
import { categories, homeDailyTiles, serviceZones, stores } from "./schema/index.js";

export const seedIds = {
  zone: "10000000-0000-4000-8000-000000000001",
  fulfilment: "10000000-0000-4000-8000-000000000011",
  staples: "10000000-0000-4000-8000-000000000021",
  dairy: "10000000-0000-4000-8000-000000000022",
  produce: "10000000-0000-4000-8000-000000000023",
} as const;

type SeedSummary = {
  serviceZones: number;
  stores: number;
  categories: number;
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

    await tx
      .update(homeDailyTiles)
      .set({ categoryId: seedIds.produce })
      .where(and(eq(homeDailyTiles.position, 1), isNull(homeDailyTiles.categoryId)));
    await tx
      .update(homeDailyTiles)
      .set({ categoryId: seedIds.staples })
      .where(and(eq(homeDailyTiles.position, 2), isNull(homeDailyTiles.categoryId)));

    return {
      serviceZones: zoneRows.length,
      stores: storeRows.length,
      categories: categoryRows.length,
    };
  });
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
