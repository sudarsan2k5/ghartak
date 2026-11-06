import { trackingTokenSchema } from "@ghartak/contracts";
import { z } from "zod";

export const trackingVaultKey = "ghartak.tracking.v1";

export type TrackingSecretStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let storeOverride: TrackingSecretStore | null = null;

export function setTrackingSecretStoreForTests(store: TrackingSecretStore | null): void {
  storeOverride = store;
}

export function createMemorySecretStore(initial: Record<string, string> = {}): TrackingSecretStore & {
  records: Map<string, string>;
} {
  const records = new Map(Object.entries(initial));
  return {
    records,
    async getItem(key) {
      return records.get(key) ?? null;
    },
    async setItem(key, value) {
      records.set(key, value);
    },
  };
}

async function readTrackingSecret(key: string): Promise<string | null> {
  return (await resolveStore()).getItem(key);
}

async function writeTrackingSecret(key: string, value: string): Promise<void> {
  await (await resolveStore()).setItem(key, value);
}

async function resolveStore(): Promise<TrackingSecretStore> {
  if (storeOverride) {
    return storeOverride;
  }
  const SecureStore = await import("expo-secure-store");
  return {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
  };
}

const maxStoredOrders = 8;

const orderNumberSchema = z.string().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/);

const vaultEntrySchema = z
  .object({
    orderNumber: orderNumberSchema,
    token: trackingTokenSchema,
    savedAt: z.iso.datetime(),
  })
  .strict();

const vaultSchema = z
  .object({
    version: z.literal(1),
    latestOrderNumber: orderNumberSchema.nullable(),
    orders: z.array(vaultEntrySchema).max(maxStoredOrders),
  })
  .strict();

type TrackingVault = z.infer<typeof vaultSchema>;

export type TrackingOrderSummary = {
  orderNumber: string;
  savedAt: string;
};

export type TrackingPersistResult = { ok: true } | { ok: false; message: string };

type SessionCredential = {
  orderNumber: string;
  token: string;
  savedAt: string;
};

let session: SessionCredential | null = null;
let lastPersistError: string | null = null;

export function readTrackingPersistError(): string | null {
  return lastPersistError;
}

export function resetTrackingCredentialsForTests(): void {
  session = null;
  lastPersistError = null;
}

export async function saveTrackingCredential(input: {
  orderNumber: string;
  token: string;
}): Promise<TrackingPersistResult> {
  const orderNumber = orderNumberSchema.parse(input.orderNumber);
  const token = trackingTokenSchema.parse(input.token);
  const savedAt = new Date().toISOString();
  session = { orderNumber, token, savedAt };
  try {
    const existing = await readVault();
    const nextOrders = [
      { orderNumber, token, savedAt },
      ...existing.orders.filter((entry) => entry.orderNumber !== orderNumber),
    ].slice(0, maxStoredOrders);
    await writeTrackingSecret(
      trackingVaultKey,
      JSON.stringify({
        version: 1 as const,
        latestOrderNumber: orderNumber,
        orders: nextOrders,
      } satisfies TrackingVault),
    );
    lastPersistError = null;
    return { ok: true };
  } catch {
    lastPersistError =
      "Your order was placed, but tracking could not be saved on this phone. You can try saving it again.";
    return { ok: false, message: lastPersistError };
  }
}

export async function listTrackingSummaries(): Promise<TrackingOrderSummary[]> {
  const vault = await readVault();
  const summaries = vault.orders.map((entry) => ({
    orderNumber: entry.orderNumber,
    savedAt: entry.savedAt,
  }));
  const current = session;
  if (current && !summaries.some((entry) => entry.orderNumber === current.orderNumber)) {
    return [{ orderNumber: current.orderNumber, savedAt: current.savedAt }, ...summaries];
  }
  return summaries;
}

export async function readLatestTrackingOrderNumber(): Promise<string | null> {
  if (session) {
    return session.orderNumber;
  }
  const vault = await readVault();
  return vault.latestOrderNumber ?? vault.orders[0]?.orderNumber ?? null;
}

export async function readTrackingToken(orderNumber: string): Promise<string | null> {
  if (session?.orderNumber === orderNumber) {
    return session.token;
  }
  const vault = await readVault();
  return vault.orders.find((entry) => entry.orderNumber === orderNumber)?.token ?? null;
}

async function readVault(): Promise<TrackingVault> {
  const raw = await readTrackingSecret(trackingVaultKey);
  if (!raw) {
    return { version: 1, latestOrderNumber: null, orders: [] };
  }
  try {
    const parsed = vaultSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      return { version: 1, latestOrderNumber: null, orders: [] };
    }
    return parsed.data;
  } catch {
    return { version: 1, latestOrderNumber: null, orders: [] };
  }
}
