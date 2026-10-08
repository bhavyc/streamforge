import IORedis, { RedisOptions } from 'ioredis';
import { CONFIG } from '../config/env';

export const redisConnectionOptions: RedisOptions = {
  host: CONFIG.REDIS_HOST,
  port: CONFIG.REDIS_PORT,
  password: CONFIG.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
};

let redisInstance: IORedis | null = null;

export function getRedisClient(): IORedis {
  if (!redisInstance) {
    redisInstance = new IORedis(redisConnectionOptions);
    redisInstance.on('error', (err) => {
      console.error('[Redis Client Error]:', err.message);
    });
  }
  return redisInstance;
}
