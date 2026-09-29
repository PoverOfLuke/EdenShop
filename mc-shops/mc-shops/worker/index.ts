import type { Env } from './env';
import {
  createSessionCookie,
  clearSessionCookie,
  createStateCookie,
  clearStateCookie,
  getStateCookie,
  generateState,
  getMerchantIdFromSession,
} from './session';
import { buildAuthorizeUrl, exchangeCodeForToken, fetchDiscordUser } from './discord';
import {
  upsertMerchant,
  getMerchantById,
  getShopsByMerchant,
  getShopById,
  createShop,
  updateShop,
  type Merchant,
  type ShopInput,
} from './db';

function json(data: unknown, status = 200, extraHeaders?: Headers): Response {
  const headers = extraHeaders ?? new Headers();
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers });
}

function redirect(location: string, extraHeaders?: Headers): Response {
  const headers = extraHeaders ?? new Headers();
  headers.set('Location', location);
  return new Response(null, { status: 302, headers });
}

// ---------------------------------------------------------------------------
// /api/auth/*
// ---------------------------------------------------------------------------

async function handleDiscordStart(env: Env): Promise<Response> {
  const state = generateState();
  const headers = new Headers();
  headers.set('Set-Cookie', createStateCookie(state));
  return redirect(buildAuthorizeUrl(env, state), headers);
}

async function handleDiscordCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = getStateCookie(request);

  const headers = new Headers();
  headers.append('Set-Cookie', clearStateCookie());

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirect('/login?status=error', headers);
  }

  try {
    const accessToken = await exchangeCodeForToken(env, code);
    const discordUser = await fetchDiscordUser(accessToken);
    const merchant = await upsertMerchant(
      env,
      discordUser.id,
      discordUser.username,
      discordUser.global_name ?? discordUser.username
    );

    if (!merchant.approved) {
      return redirect('/login?status=pending', headers);
    }

    headers.append('Set-Cookie', await createSessionCookie(env, merchant.id));
    return redirect('/', headers);
  } catch {
    return redirect('/login?status=error', headers);
  }
}

function handleLogout(): Response {
  const headers = new Headers();
  headers.set('Set-Cookie', clearSessionCookie());
  return redirect('/', headers);
}

async function requireApprovedMerchant(
  request: Request,
  env: Env
): Promise<{ merchant: Merchant } | { response: Response }> {
  const merchantId = await getMerchantIdFromSession(request, env);
  if (merchantId === null) {
    return { response: json({ error: 'not_authenticated', reason: 'invalid_session' }, 401) };
  }

  const merchant = await getMerchantById(env, merchantId);
  if (!merchant) {
    return { response: json({ error: 'not_authenticated', reason: 'merchant_not_found' }, 401) };
  }

  if (!merchant.approved) {
    const headers = new Headers();
    headers.set('Set-Cookie', clearSessionCookie());
    return { response: json({ error: 'not_approved', reason: 'not_approved' }, 401, headers) };
  }

  return { merchant };
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const result = await requireApprovedMerchant(request, env);
  if ('response' in result) return result.response;

  const { merchant } = result;
  return json({
    display_name: merchant.display_name ?? merchant.discord_username ?? 'Merchant',
    discord_username: merchant.discord_username,
    approved: merchant.approved,
  });
}

// ---------------------------------------------------------------------------
// /api/merchant/shops
// ---------------------------------------------------------------------------

function parseShopInput(body: unknown): { input: ShopInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { error: 'Name is required.' };

  const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : '';
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: 'Slug must contain only lowercase letters, numbers and hyphens.' };
  }

  const parseCoord = (value: unknown): number | null | 'invalid' => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : 'invalid';
  };

  const x = parseCoord(b.x);
  if (x === 'invalid') return { error: 'X must be a number.' };
  const z = parseCoord(b.z);
  if (z === 'invalid') return { error: 'Z must be a number.' };

  const description = typeof b.description === 'string' ? b.description.trim() || null : null;
  const directions = typeof b.directions === 'string' ? b.directions.trim() || null : null;

  return { input: { name, slug, x, z, description, directions } };
}

function isDuplicateSlugError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('duplicate key') || message.includes('shops_slug_key');
}

async function handleShopsCollection(request: Request, env: Env): Promise<Response> {
  const result = await requireApprovedMerchant(request, env);
  if ('response' in result) return result.response;
  const { merchant } = result;

  if (request.method === 'GET') {
    const shops = await getShopsByMerchant(env, merchant.id);
    return json({ shops });
  }

  if (request.method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400);
    }

    const parsed = parseShopInput(body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);

    try {
      const shop = await createShop(env, merchant.id, parsed.input);
      return json({ shop }, 201);
    } catch (err) {
      if (isDuplicateSlugError(err)) {
        return json({ error: 'A shop with this slug already exists.' }, 409);
      }
      return json({ error: 'Could not create the shop.' }, 500);
    }
  }

  return json({ error: 'Method not allowed.' }, 405);
}

async function handleShopItem(request: Request, env: Env, shopId: number): Promise<Response> {
  const result = await requireApprovedMerchant(request, env);
  if ('response' in result) return result.response;
  const { merchant } = result;

  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const existing = await getShopById(env, shopId);
  if (!existing) return json({ error: 'Shop not found.' }, 404);
  if (existing.merchant_id !== merchant.id) return json({ error: 'Not your shop.' }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = parseShopInput(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  try {
    const shop = await updateShop(env, shopId, parsed.input);
    return json({ shop });
  } catch (err) {
    if (isDuplicateSlugError(err)) {
      return json({ error: 'A shop with this slug already exists.' }, 409);
    }
    return json({ error: 'Could not update the shop.' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // TEMPORARY — remove once the env var issue is confirmed fixed.
    // Reports only whether each binding is present, never its value.
    if (pathname === '/api/debug/env') {
      return json({
        DISCORD_CLIENT_ID: Boolean(env.DISCORD_CLIENT_ID),
        DISCORD_CLIENT_SECRET: Boolean(env.DISCORD_CLIENT_SECRET),
        DISCORD_REDIRECT_URI: Boolean(env.DISCORD_REDIRECT_URI),
        SESSION_SECRET: Boolean(env.SESSION_SECRET),
        NEON_DATABASE_URL: Boolean(env.NEON_DATABASE_URL),
      });
    }

    if (pathname === '/api/auth/discord') return handleDiscordStart(env);
    if (pathname === '/api/auth/discord/callback') return handleDiscordCallback(request, env);
    if (pathname === '/api/auth/logout') return handleLogout();
    if (pathname === '/api/auth/me') return handleMe(request, env);
    if (pathname === '/api/merchant/shops') return handleShopsCollection(request, env);

    const shopMatch = pathname.match(/^\/api\/merchant\/shops\/(\d+)$/);
    if (shopMatch) return handleShopItem(request, env, Number(shopMatch[1]));

    // Everything else: serve the static Astro site as before.
    return env.ASSETS.fetch(request);
  },
};
