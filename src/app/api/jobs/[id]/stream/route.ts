import { NextRequest } from 'next/server';
import { getVideoJob } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendEvent = (data: any) => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }
      };

      const interval = setInterval(async () => {
        try {
          const job = await getVideoJob(id);

          if (!job) {
            sendEvent({ error: 'Job not found', notFound: true });
            clearInterval(interval);
            isClosed = true;
            controller.close();
            return;
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

          sendEvent({
            id: job.id,
            status: state,
            progress: percent,
            progressMessage: message,
            currentStage: stage,
            failedReason: job.failedReason,
            result: job.returnvalue,
          });

          if (state === 'completed' || state === 'failed') {
            clearInterval(interval);
            isClosed = true;
            controller.close();
          }
        } catch (err: any) {
          sendEvent({ error: err.message });
          clearInterval(interval);
          isClosed = true;
          controller.close();
        }
      }, 600);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        isClosed = true;
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
