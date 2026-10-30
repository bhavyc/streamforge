import { NextRequest, NextResponse } from 'next/server';
import { recordVisit } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty in some beacon calls
    }

    // Resolve client IP
    const forwarded = req.headers.get('x-forwarded-for');
    const cfIp = req.headers.get('cf-connecting-ip');
    const realIp = req.headers.get('x-real-ip');
    const ip = (cfIp || (forwarded ? forwarded.split(',')[0].trim() : '') || realIp || '127.0.0.1').trim();

    // Resolve country if forwarded by Cloudflare/proxy
    const country = req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country') || undefined;

    // Headers
    const userAgent = req.headers.get('user-agent') || body.userAgent || '';
    const referrer = body.referrer || req.headers.get('referer') || '';
    const path = body.path || '/';
    const screen = body.screen || '';
    const visitorId = body.visitorId || '';

    // Asynchronously record visit (non-blocking)
    await recordVisit({
      visitorId,
      ip,
      path,
      referrer,
      userAgent,
      screen,
      country,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
