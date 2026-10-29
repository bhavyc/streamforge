import { NextResponse } from 'next/server';
import { getQueueMetrics, isBullMQ } from '@/lib/queue';
import { CONFIG } from '@/config/env';

export async function GET() {
  try {
    const [metrics, hasRedis] = await Promise.all([
      getQueueMetrics(),
      isBullMQ(),
    ]);
    const memUsage = process.memoryUsage();

    return NextResponse.json({
      success: true,
      redisConnected: hasRedis,
      queue: {
        name: CONFIG.QUEUE_NAME,
        metrics,
        workersActive: 1,
        engine: metrics.engine,
      },
      system: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        storageDriver: CONFIG.STORAGE_DRIVER,
        memoryUsageMb: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
