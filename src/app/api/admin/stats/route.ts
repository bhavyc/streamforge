import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedAdmin } from '@/lib/auth';
import { getAnalyticsSummary } from '@/lib/analytics';
import { getQueueMetrics, isBullMQ } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin session
  if (!isAuthenticatedAdmin(req)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized access. Please login as admin.' },
      { status: 401 }
    );
  }

  try {
    const [analytics, queueMetrics, hasRedis] = await Promise.all([
      getAnalyticsSummary(),
      getQueueMetrics(),
      isBullMQ(),
    ]);

    const memUsage = process.memoryUsage();

    return NextResponse.json({
      success: true,
      analytics,
      system: {
        uptimeSeconds: Math.round(process.uptime()),
        redisConnected: hasRedis,
        queue: queueMetrics,
        memoryUsageMb: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch admin statistics' },
      { status: 500 }
    );
  }
}
