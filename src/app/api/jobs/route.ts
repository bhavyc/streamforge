import { NextResponse } from 'next/server';
import { getJobs } from '@/lib/queue';

export async function GET() {
  try {
    const jobs = await getJobs(['active', 'waiting', 'completed', 'failed']);

    const formatted = await Promise.all(
      jobs.map(async (j: any) => {
        let state = 'unknown';
        try {
          state = typeof j.getState === 'function' ? await j.getState() : (j.status || 'unknown');
        } catch {
          state = j.status || 'unknown';
        }

        const progressData = j.progress;
        let progress = 0;
        let message = '';
        if (typeof progressData === 'number') {
          progress = progressData;
        } else if (progressData && typeof progressData === 'object') {
          progress = progressData.percent || 0;
          message = progressData.message || '';
        }

        return {
          id: j.id,
          status: state,
          progress,
          message,
          failedReason: j.failedReason,
          fileName: j.data?.originalFileName,
          uploadedAt: j.data?.uploadedAt,
          timestamp: j.timestamp,
          processedOn: j.processedOn,
          finishedOn: j.finishedOn,
          result: j.returnvalue,
        };
      })
    );

    const counts = {
      active: formatted.filter((j) => j.status === 'active').length,
      waiting: formatted.filter((j) => j.status === 'waiting').length,
      completed: formatted.filter((j) => j.status === 'completed').length,
      failed: formatted.filter((j) => j.status === 'failed').length,
    };

    return NextResponse.json({
      success: true,
      jobs: formatted,
      counts,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
