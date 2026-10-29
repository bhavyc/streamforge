import IORedis, { RedisOptions } from 'ioredis';
import { CONFIG } from '../config/env';

const isTls = CONFIG.REDIS_HOST.includes('upstash.io') || process.env.REDIS_TLS === 'true';

export const redisConnectionOptions: RedisOptions = {
  host: CONFIG.REDIS_HOST,
  port: CONFIG.REDIS_PORT,
  password: CONFIG.REDIS_PASSWORD || undefined,
  tls: isTls ? {} : undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  connectTimeout: 6000,
  retryStrategy(times) {
    // Stop reconnecting after 3 tries when Redis server is not running
    if (times > 3) {
      return null;
    }
    return 1000;
  },
};

let redisInstance: IORedis | null = null;
let errorLoggedOnce = false;

export function getRedisClient(): IORedis {
  if (!redisInstance) {
    redisInstance = new IORedis(redisConnectionOptions);
    redisInstance.on('error', (err) => {
      if (!errorLoggedOnce) {
        console.warn(`[Redis Notice]: No active Redis host at ${CONFIG.REDIS_HOST}:${CONFIG.REDIS_PORT} (${err.message}). Seamlessly operating in Embedded Queue Mode.`);
        errorLoggedOnce = true;
      }
    });
    redisInstance.on('connect', () => {
      errorLoggedOnce = false;
      console.log(`[Redis Connected]: Distributed BullMQ broker active at ${CONFIG.REDIS_HOST}:${CONFIG.REDIS_PORT}`);
    });
  }
  return redisInstance;
}

