import { NextResponse } from 'next/server';
import fs from 'fs';
import { CONFIG } from '@/config/env';
import { getRedisClient } from '@/lib/redis';
import { getQueueMetrics } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, any> = {
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: CONFIG.NODE_ENV,
    storageDriver: CONFIG.STORAGE_DRIVER,
  };

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Check 1: Storage directory accessibility
  try {
    const rawExists = fs.existsSync(CONFIG.RAW_DIR);
    const outputsExists = fs.existsSync(CONFIG.OUTPUTS_DIR);
    checks.storage = {
      status: rawExists && outputsExists ? 'healthy' : 'degraded',
      rawDirectoryAccessible: rawExists,
      outputsDirectoryAccessible: outputsExists,
    };
    if (!rawExists || !outputsExists) overallStatus = 'degraded';
  } catch (err: any) {
    checks.storage = { status: 'unhealthy', error: err.message };
    overallStatus = 'unhealthy';
  }

  // Check 2: Redis broker connectivity
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    checks.redis = {
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      host: `${CONFIG.REDIS_HOST}:${CONFIG.REDIS_PORT}`,
      response: pong,
    };
  } catch (err: any) {
    checks.redis = {
      status: 'unhealthy',
      error: err.message,
      host: `${CONFIG.REDIS_HOST}:${CONFIG.REDIS_PORT}`,
    };
    // Redis offline does not fully crash app because of embedded queue fallback
    if (overallStatus !== 'unhealthy') overallStatus = 'degraded';
  }

  // Check 3: Queue metrics
  try {
    const metrics = await getQueueMetrics();
    checks.queue = {
      status: 'healthy',
      metrics,
    };
  } catch (err: any) {
    checks.queue = { status: 'degraded', error: err.message };
  }

  checks.responseTimeMs = Date.now() - startTime;
  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  return NextResponse.json(
    {
      status: overallStatus,
      ...checks,
    },
    { status: statusCode }
  );
}
