import { Redis } from "ioredis";

export type RedisConnection = {
  client: Redis;
  close: () => Promise<void>;
};

export function createRedisConnection(
  url: string,
  onError: (error: Error) => void,
): RedisConnection {
  let closing = false;
  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    retryStrategy(times: number): number | null {
      if (times > 5) {
        return null;
      }

      return Math.min(times * 200, 2_000);
    },
  });

  client.on("error", (error: Error) => {
    if (!closing) {
      onError(error);
    }
  });

  return {
    client,
    async close(): Promise<void> {
      closing = true;

      if (client.status === "end") {
        return;
      }

      if (client.status === "ready" || client.status === "connect") {
        await client.quit();
        return;
      }

      client.disconnect();
    },
  };
}

export async function connectRedis(client: Redis): Promise<void> {
  if (client.status === "wait") {
    await client.connect();
  }
}

export async function pingRedis(client: Redis): Promise<void> {
  const response = await client.ping();

  if (response !== "PONG") {
    throw new Error("Unexpected Redis ping response");
  }
}
