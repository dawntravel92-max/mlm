import Redis from "ioredis";

let client: Redis | null = null;
let unavailableLogged = false;

function getClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!unavailableLogged) {
      console.info("[Redis] REDIS_URL not configured; using database cache fallback");
      unavailableLogged = true;
    }
    return null;
  }
  if (!client) {
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempts: number) => Math.min(250 * 2 ** attempts, 5_000),
    });
    client.on("error", (error: Error) =>
      console.warn("[Redis] connection failure; database cache fallback active", error)
    );
    client.on("reconnecting", (delay: number) =>
      console.warn(`[Redis] reconnecting in ${delay}ms`)
    );
  }
  return client;
}

async function withRedis<T>(operation: (redis: Redis) => Promise<T>) {
  const redis = getClient();
  if (!redis) return null;
  try {
    if (redis.status === "wait") await redis.connect();
    return await operation(redis);
  } catch (error) {
    console.warn("[Redis] operation failed; database cache fallback active", error);
    return null;
  }
}

export async function getRedisCache(cacheKey: string) {
  return withRedis(redis => redis.get(`rma:${cacheKey}`));
}

export async function putRedisCache(
  cacheKey: string,
  payload: string,
  ttlMs: number
) {
  const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
  return withRedis(redis => redis.set(`rma:${cacheKey}`, payload, "EX", ttlSeconds));
}

export function closeRedis() {
  if (client) void client.quit();
  client = null;
}
