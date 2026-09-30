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
  getAllShops,
  getShopBySlug,
  createShop,
  updateShop,
  ensureShopItemsTable,
  getShopItems,
  getShopItemById,
  createShopItem,
  updateShopItem,
  deleteShopItem,
  getAllShopItemsWithShop,
  getShopItemWithShopById,
  type Merchant,
  type Shop,
  type ShopInput,
  type ShopItemInput,
} from './db';
import { getCatalogItem, catalogItemExists, searchCatalog } from './catalog';

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

/**
 * Centralized auth check, reused by every /api/merchant/* and /api/auth/me
 * handler. Distinguishes *why* a request is unauthenticated so the client
 * (and logs) can tell "no/invalid cookie" apart from "cookie valid but
 * merchant vanished" apart from "logged in but not approved yet".
 */
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

/**
 * Ownership check reused by every endpoint that operates on a specific shop
 * (shop edits, and every shop_items endpoint). Never trusts a shop_id from
 * the client beyond "does it belong to this session's merchant".
 */
async function requireOwnedShop(
  env: Env,
  merchant: Merchant,
  shopId: number
): Promise<{ shop: Shop } | { response: Response }> {
  const shop = await getShopById(env, shopId);
  if (!shop) return { response: json({ error: 'shop_not_found' }, 404) };
  if (shop.merchant_id !== merchant.id) return { response: json({ error: 'forbidden' }, 403) };
  return { shop };
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

function isDuplicateKeyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('duplicate key');
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
      if (isDuplicateKeyError(err)) {
        return json({ error: 'A shop with this slug already exists.' }, 409);
      }
      return json({ error: 'Could not create the shop.' }, 500);
    }
  }

  return json({ error: 'Method not allowed.' }, 405);
}

async function handleShopRecordUpdate(request: Request, env: Env, shopId: number): Promise<Response> {
  const result = await requireApprovedMerchant(request, env);
  if ('response' in result) return result.response;
  const { merchant } = result;

  const owned = await requireOwnedShop(env, merchant, shopId);
  if ('response' in owned) return owned.response;

  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed.' }, 405);
  }

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
    if (isDuplicateKeyError(err)) {
      return json({ error: 'A shop with this slug already exists.' }, 409);
    }
    return json({ error: 'Could not update the shop.' }, 500);
  }
}

// ---------------------------------------------------------------------------
// /api/catalog/search — public, read-only lookup into the static catalog.
// ---------------------------------------------------------------------------

function handleCatalogSearch(request: Request): Response {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  return json({ items: searchCatalog(q) });
}

// ---------------------------------------------------------------------------
// Public, read-only endpoints backing Home / Shops / Products.
// No auth: this is the same data anyone browsing the site can already see.
// ---------------------------------------------------------------------------

async function handlePublicShops(env: Env): Promise<Response> {
  const shops = await getAllShops(env);
  return json({ shops });
}

async function handlePublicShopDetail(env: Env, slug: string): Promise<Response> {
  const shop = await getShopBySlug(env, slug);
  if (!shop) return json({ error: 'shop_not_found' }, 404);
  return json({ shop });
}

async function handlePublicShopItems(env: Env, slug: string): Promise<Response> {
  const shop = await getShopBySlug(env, slug);
  if (!shop) return json({ error: 'shop_not_found' }, 404);
  await ensureShopItemsTable(env);
  const items = await getShopItems(env, shop.id);
  return json({ shop, items: items.map(enrichShopItem) });
}

async function handlePublicProducts(env: Env): Promise<Response> {
  await ensureShopItemsTable(env);
  const rows = await getAllShopItemsWithShop(env);
  const items = rows.map((row) => {
    const catalog = getCatalogItem(row.minecraft_id);
    return {
      ...row,
      catalog: catalog ? { name: catalog.name, category: catalog.category, image_url: catalog.image_url } : null,
    };
  });
  return json({ items });
}

async function handlePublicProductDetail(env: Env, id: number): Promise<Response> {
  const row = await getShopItemWithShopById(env, id);
  if (!row) return json({ error: 'product_not_found' }, 404);
  const catalog = getCatalogItem(row.minecraft_id);
  return json({
    item: {
      ...row,
      catalog: catalog ? { name: catalog.name, category: catalog.category, image_url: catalog.image_url } : null,
    },
  });
}

// ---------------------------------------------------------------------------
// /api/merchant/shops/:shopId/items
// ---------------------------------------------------------------------------

function num(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

function parseShopItemInput(body: unknown): { input: ShopItemInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const minecraftId = typeof b.minecraftId === 'string' ? b.minecraftId.trim() : '';
  if (!minecraftId) return { error: 'Choose an item from the catalog.' };
  if (!catalogItemExists(minecraftId)) return { error: 'That item is not in the Minecraft catalog.' };

  const fields = [
    'quantity',
    'compactedQuantity',
    'essenceQuantity',
    'sellAmount',
    'sellPrice',
    'buyAmount',
    'buyPrice',
    'compactedSellAmount',
    'compactedSellPrice',
    'compactedBuyAmount',
    'compactedBuyPrice',
  ] as const;

  const parsed: Record<string, number | null> = {};
  for (const field of fields) {
    const value = num(b[field]);
    if (value === 'invalid') return { error: `${field} must be a number >= 0.` };
    parsed[field] = value;
  }

  // A sell/buy pair only counts as "configured" when BOTH amount and price
  // are set; a lone amount or a lone price is treated as not configured.
  const sellConfigured = parsed.sellAmount !== null && parsed.sellPrice !== null;
  const buyConfigured = parsed.buyAmount !== null && parsed.buyPrice !== null;
  const compactedSellConfigured = parsed.compactedSellAmount !== null && parsed.compactedSellPrice !== null;
  const compactedBuyConfigured = parsed.compactedBuyAmount !== null && parsed.compactedBuyPrice !== null;

  if (!sellConfigured && !buyConfigured && !compactedSellConfigured && !compactedBuyConfigured) {
    return { error: 'Configure at least one of: sell, buy, compacted sell, compacted buy.' };
  }

  // Drop half-filled pairs instead of silently keeping a stray amount/price.
  if (!sellConfigured) { parsed.sellAmount = null; parsed.sellPrice = null; }
  if (!buyConfigured) { parsed.buyAmount = null; parsed.buyPrice = null; }
  if (!compactedSellConfigured) { parsed.compactedSellAmount = null; parsed.compactedSellPrice = null; }
  if (!compactedBuyConfigured) { parsed.compactedBuyAmount = null; parsed.compactedBuyPrice = null; }

  return {
    input: {
      minecraftId,
      quantity: parsed.quantity,
      compactedQuantity: parsed.compactedQuantity,
      essenceQuantity: parsed.essenceQuantity,
      sellAmount: parsed.sellAmount,
      sellPrice: parsed.sellPrice,
      buyAmount: parsed.buyAmount,
      buyPrice: parsed.buyPrice,
      compactedSellAmount: parsed.compactedSellAmount,
      compactedSellPrice: parsed.compactedSellPrice,
      compactedBuyAmount: parsed.compactedBuyAmount,
      compactedBuyPrice: parsed.compactedBuyPrice,
    },
  };
}

function enrichShopItem(item: Awaited<ReturnType<typeof getShopItems>>[number]) {
  const catalog = getCatalogItem(item.minecraft_id);
  return {
    ...item,
    catalog: catalog
      ? { name: catalog.name, category: catalog.category, image_url: catalog.image_url }
      : null,
  };
}

async function handleShopItemsCollection(request: Request, env: Env, shopId: number): Promise<Response> {
  const result = await requireApprovedMerchant(request, env);
  if ('response' in result) return result.response;
  const { merchant } = result;

  const owned = await requireOwnedShop(env, merchant, shopId);
  if ('response' in owned) return owned.response;

  await ensureShopItemsTable(env);

  if (request.method === 'GET') {
    const items = await getShopItems(env, shopId);
    return json({ shop: owned.shop, items: items.map(enrichShopItem) });
  }

  if (request.method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400);
    }

    const parsed = parseShopItemInput(body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);

    try {
      const item = await createShopItem(env, shopId, parsed.input);
      return json({ shop: owned.shop, item: enrichShopItem(item) }, 201);
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return json({ error: 'This item is already configured for this shop.' }, 409);
      }
      return json({ error: 'Could not add the item.' }, 500);
    }
  }

  return json({ error: 'Method not allowed.' }, 405);
}

async function handleShopItemDetail(request: Request, env: Env, shopId: number, itemId: number): Promise<Response> {
  const result = await requireApprovedMerchant(request, env);
  if ('response' in result) return result.response;
  const { merchant } = result;

  const owned = await requireOwnedShop(env, merchant, shopId);
  if ('response' in owned) return owned.response;

  await ensureShopItemsTable(env);

  const existing = await getShopItemById(env, itemId);
  if (!existing || existing.shop_id !== shopId) {
    return json({ error: 'Item not found.' }, 404);
  }

  if (request.method === 'PUT') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400);
    }

    const parsed = parseShopItemInput(body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);

    try {
      const item = await updateShopItem(env, itemId, parsed.input);
      return json({ item: enrichShopItem(item) });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return json({ error: 'This item is already configured for this shop.' }, 409);
      }
      return json({ error: 'Could not update the item.' }, 500);
    }
  }

  if (request.method === 'DELETE') {
    await deleteShopItem(env, itemId);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed.' }, 405);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // TEMPORARY — remove once the env var issue is confirmed fixed.
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
    if (pathname === '/api/catalog/search') return handleCatalogSearch(request);

    if (pathname === '/api/shops') return handlePublicShops(env);
    if (pathname === '/api/products') return handlePublicProducts(env);

    const publicProductMatch = pathname.match(/^\/api\/products\/(\d+)$/);
    if (publicProductMatch) return handlePublicProductDetail(env, Number(publicProductMatch[1]));

    const publicShopItemsMatch = pathname.match(/^\/api\/shops\/([a-z0-9-]+)\/items$/);
    if (publicShopItemsMatch) return handlePublicShopItems(env, publicShopItemsMatch[1]);

    const publicShopMatch = pathname.match(/^\/api\/shops\/([a-z0-9-]+)$/);
    if (publicShopMatch) return handlePublicShopDetail(env, publicShopMatch[1]);

    if (pathname === '/api/merchant/shops') return handleShopsCollection(request, env);

    const shopMatch = pathname.match(/^\/api\/merchant\/shops\/(\d+)$/);
    if (shopMatch) return handleShopRecordUpdate(request, env, Number(shopMatch[1]));

    const itemsCollectionMatch = pathname.match(/^\/api\/merchant\/shops\/(\d+)\/items$/);
    if (itemsCollectionMatch) return handleShopItemsCollection(request, env, Number(itemsCollectionMatch[1]));

    const itemDetailMatch = pathname.match(/^\/api\/merchant\/shops\/(\d+)\/items\/(\d+)$/);
    if (itemDetailMatch) {
      return handleShopItemDetail(request, env, Number(itemDetailMatch[1]), Number(itemDetailMatch[2]));
    }

    // Everything else: serve the static Astro site as before.
    return env.ASSETS.fetch(request);
  },
};
