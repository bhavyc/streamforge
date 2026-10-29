import { NextResponse } from 'next/server';
import { ensureWorkerStarted } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureWorkerStarted().catch(() => {});
  return new NextResponse('OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
