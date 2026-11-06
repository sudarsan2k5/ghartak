import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema/index.js";

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Connection = {
  client: Sql;
  db: Database;
};

let connection: Connection | undefined;

export function openDatabase(connectionString: string): Database {
  if (connection) {
    return connection.db;
  }

  const client = postgres(connectionString, {
    max: 10,
    connect_timeout: 10,
    idle_timeout: 20,
    connection: {
      application_name: "ghartak-api",
    },
  });

  connection = {
    client,
    db: drizzle(client, { schema }),
  };

  return connection.db;
}

export async function pingDatabase(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}

export async function closeDatabase(): Promise<void> {
  const current = connection;
  connection = undefined;

  if (!current) {
    return;
  }

  await current.client.end({ timeout: 5 });
}

export async function withTransaction<T>(
  db: Database,
  callback: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(callback);
}
