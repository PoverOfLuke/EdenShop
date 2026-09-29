import type { Env } from './env';

// EdenShop session cookie: a small HMAC-signed, HttpOnly/Secure cookie.
//
// The cookie holds ONLY { mid: merchant_id, exp: unix seconds }. It never
// carries the Discord access/refresh token, and it never carries the
// "approved" flag itself: every server-side check re-reads "approved"
// fresh from Neon (see db.ts), so a revoked merchant loses access on the
// very next request instead of waiting for the cookie to expire.

const SESSION_COOKIE = 'eden_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const STATE_COOKIE = 'eden_oauth_state';
const STATE_MAX_AGE_SECONDS = 60 * 10; // 10 minutes, just enough for the OAuth round trip

interface SessionPayload {
  mid: number;
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Builds the Set-Cookie value for a fresh, signed session for this merchant. */
export async function createSessionCookie(env: Env, merchantId: number): Promise<string> {
  const payload: SessionPayload = {
    mid: merchantId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getHmacKey(env.SESSION_SECRET);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  const token = `${payloadB64}.${sigB64}`;

  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/**
 * Verifies the session cookie's signature and expiry. Returns the
 * merchant_id if valid, or null otherwise. Does NOT check "approved" —
 * callers must look that up fresh via db.ts.
 */
export async function getMerchantIdFromSession(request: Request, env: Env): Promise<number | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await getHmacKey(env.SESSION_SECRET);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as SessionPayload;
    if (typeof payload.mid !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload.mid;
  } catch {
    return null;
  }
}

/** Random, unsigned, short-lived cookie used to validate the OAuth2 `state` param. */
export function createStateCookie(state: string): string {
  return `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_MAX_AGE_SECONDS}`;
}

export function clearStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getStateCookie(request: Request): string | null {
  return readCookie(request, STATE_COOKIE);
}

export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(24)));
}
