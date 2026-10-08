import { NextRequest, NextResponse } from 'next/server';
import { getVideoJob } from '@/lib/queue';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await getVideoJob(id);

    if (!job) {
      return NextResponse.json({ error: `Job ${id} not found.` }, { status: 404 });
    }

    const state = typeof job.getState === 'function' ? await job.getState() : job.status;
    const progressData = job.progress;

    let percent = 0;
    let message = '';
    let stage = '';

    if (typeof progressData === 'number') {
      percent = progressData;
    } else if (progressData && typeof progressData === 'object') {
      percent = (progressData as any).percent || 0;
      message = (progressData as any).message || '';
      stage = (progressData as any).stage || '';
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: state,
        progress: percent,
        progressMessage: message,
        currentStage: stage,
        failedReason: job.failedReason,
        data: job.data,
        result: job.returnvalue,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch job' },
      { status: 500 }
    );
  }
}
