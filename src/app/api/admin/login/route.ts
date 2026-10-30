import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminCredentials,
  generateAdminSessionToken,
  isAuthenticatedAdmin,
  ADMIN_COOKIE_NAME,
  ADMIN_CREDENTIALS,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Check authentication status
 */
export async function GET(req: NextRequest) {
  const isAuth = isAuthenticatedAdmin(req);
  return NextResponse.json({
    authenticated: isAuth,
    email: isAuth ? ADMIN_CREDENTIALS.email : null,
  });
}

/**
 * Process admin login
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    const isValid = verifyAdminCredentials(email, password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid admin credentials. Please verify your email and password.' },
        { status: 401 }
      );
    }

    const token = generateAdminSessionToken();

    const response = NextResponse.json({
      success: true,
      message: 'Admin authenticated successfully.',
      email: ADMIN_CREDENTIALS.email,
    });

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Login failed' },
      { status: 500 }
    );
  }
}
