import crypto from 'crypto';
import { NextRequest } from 'next/server';

export const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'bhavyc888@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'Bc22012001@#$',
};

const AUTH_SECRET = process.env.ADMIN_SECRET || 'streamforge-bhavya-admin-secret-key-2026';
export const ADMIN_COOKIE_NAME = 'sf_admin_session';

/**
 * Validates admin login credentials
 */
export function verifyAdminCredentials(email?: string, password?: string): boolean {
  if (!email || !password) return false;
  return (
    email.trim().toLowerCase() === ADMIN_CREDENTIALS.email.toLowerCase() &&
    password === ADMIN_CREDENTIALS.password
  );
}

/**
 * Generates a signed, tamper-proof session token valid for 7 days
 */
export function generateAdminSessionToken(): string {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${ADMIN_CREDENTIALS.email.toLowerCase()}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

/**
 * Validates a session token
 */
export function verifyAdminSessionToken(token?: string | null): boolean {
  if (!token) return false;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf-8');
    const [email, expiresStr, hmac] = raw.split(':');
    if (!email || !expiresStr || !hmac) return false;

    const expiresAt = parseInt(expiresStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

    if (email.toLowerCase() !== ADMIN_CREDENTIALS.email.toLowerCase()) return false;

    const expectedPayload = `${email.toLowerCase()}:${expiresStr}`;
    const expectedHmac = crypto.createHmac('sha256', AUTH_SECRET).update(expectedPayload).digest('hex');

    const hmacBuf = Buffer.from(hmac);
    const expectedBuf = Buffer.from(expectedHmac);
    if (hmacBuf.length !== expectedBuf.length) return false;

    return crypto.timingSafeEqual(hmacBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Checks if incoming request has a valid admin session cookie
 */
export function isAuthenticatedAdmin(req: NextRequest): boolean {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(cookie);
}
