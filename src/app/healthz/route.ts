import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse('OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
