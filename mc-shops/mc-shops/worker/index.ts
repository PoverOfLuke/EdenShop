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
  getShopPublicById,
  getShopPublicBySlug,
  createShop,
  updateShop,
  deleteShopCascade,
  ensureSchema,
  getShopItems,
  getShopItemById,
  createShopItem,
  updateShopItem,
  deleteShopItem,
  getAllShopItemsWithShop,
  getShopItemWithShopById,
  getAllCountries,
  createCountry,
  updateCountry,
  deleteCountry,
  getAllCities,
  getCitiesByCountry,
  getCityById,
  createCity,
  updateCity,
  deleteCity,
  getCatalogMap,
  catalogItemExistsDb,
  searchCatalogDb,
  getAllCatalogItemsAdmin,
  createCatalogItem,
  updateCatalogItem,
  setCatalogItemActive,
  getAllMerchantsAdmin,
  setMerchantApproved,
  type Merchant,
  type Shop,
  type ShopInput,
  type ShopItemInput,
  type ShopItem,
  type CatalogItemRow,
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

async function readJson(request: Request): Promise<{ body: unknown } | { response: Response }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: json({ error: 'Invalid JSON body.' }, 400) };
  }
}

// ---------------------------------------------------------------------------
// Rate limiting (Cloudflare Workers Rate Limiting binding, see wrangler.jsonc)
// ---------------------------------------------------------------------------

/**
 * Returns true when the caller is over the limit. The key combines the
 * route and the client IP, so the two OAuth routes are counted separately.
 * Fails OPEN: if the binding is missing (e.g. local dev) or errors out, the
 * request goes through — a limiter hiccup must never lock everyone out of login.
 */
async function isRateLimited(request: Request, env: Env, route: string): Promise<boolean> {
  if (!env.AUTH_LIMITER) return false;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  try {
    const { success } = await env.AUTH_LIMITER.limit({ key: `${route}:${ip}` });
    return !success;
  } catch {
    return false;
  }
}

function rateLimitedRedirect(): Response {
  const headers = new Headers();
  headers.set('Retry-After', '60');
  return redirect('/login?status=rate_limited', headers);
}

// ---------------------------------------------------------------------------
// Security headers — applied to EVERY response (API and static assets).
//
// The CSP was written after checking what the site really loads:
//  - scripts: only same-origin files (Astro bundles + /site.js). No inline
//    scripts and no inline event handlers (onerror=...) are used anymore.
//  - styles: same-origin + Google Fonts CSS; 'unsafe-inline' is needed
//    because Astro inlines small stylesheets and some templates use style="".
//  - fonts: Google Fonts files.
//  - images: same-origin (/items/*.png) + data: URIs.
//  - fetch(): same-origin API only. Discord login is a plain top-level
//    redirect, which CSP does not restrict.
// ---------------------------------------------------------------------------

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function withSecurityHeaders(response: Response): Response {
  // Responses coming from env.ASSETS.fetch() have immutable headers: copy first.
  const secured = new Response(response.body, response);
  secured.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  secured.headers.set('X-Frame-Options', 'DENY');
  return secured;
}

// ---------------------------------------------------------------------------
// /api/auth/*
// ---------------------------------------------------------------------------

async function handleDiscordStart(request: Request, env: Env): Promise<Response> {
  if (await isRateLimited(request, env, 'discord-start')) return rateLimitedRedirect();
  const state = generateState();
  const headers = new Headers();
  headers.set('Set-Cookie', createStateCookie(state));
  return redirect(buildAuthorizeUrl(env, state), headers);
}

async function handleDiscordCallback(request: Request, env: Env): Promise<Response> {
  if (await isRateLimited(request, env, 'discord-callback')) return rateLimitedRedirect();
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

/** Centralized auth check, reused by every /api/merchant/* and /api/auth/me handler. */
async function requireApprovedMerchant(
  request: Request,
  env: Env
): Promise<{ merchant: Merchant } | { response: Response }> {
  // Runs before the first SELECT: on a cold instance /api/auth/me would
  // otherwise read merchants without the is_admin column and every
  // /api/admin/* route would 403 until some other endpoint ran the DDL.
  await ensureSchema(env);

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

/** Same session/approval check, plus is_admin. Reused by every /api/admin/* handler. */
async function requireAdmin(request: Request, env: Env): Promise<{ merchant: Merchant } | { response: Response }> {
  const result = await requireApprovedMerchant(request, env);
  if ('response' in result) return result;
  if (!result.merchant.is_admin) {
    return { response: json({ error: 'forbidden', reason: 'not_admin' }, 403) };
  }
  return result;
}

/** Ownership check reused by every endpoint that operates on a specific shop. */
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
    is_admin: merchant.is_admin,
  });
}

// ---------------------------------------------------------------------------
// /api/merchant/shops — now with optional country/city
// ---------------------------------------------------------------------------

async function parseShopInput(env: Env, body: unknown): Promise<{ input: ShopInput } | { error: string }> {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { error: 'Name is required.' };

  // Any `slug` sent by a client is ignored on purpose: slugs are server-only.

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

  const countryId = parseCoord(b.countryId);
  if (countryId === 'invalid') return { error: 'Invalid country.' };
  let cityId = parseCoord(b.cityId);
  if (cityId === 'invalid') return { error: 'Invalid city.' };

  if (cityId !== null) {
    if (countryId === null) return { error: 'Select a country before a city.' };
    const city = await getCityById(env, cityId);
    if (!city || city.country_id !== countryId) return { error: 'That city does not belong to the selected country.' };
  }

  return { input: { name, x, z, description, directions, countryId, cityId } };
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
    const read = await readJson(request);
    if ('response' in read) return read.response;

    const parsed = await parseShopInput(env, read.body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);

    try {
      const shop = await createShop(env, merchant.id, parsed.input);
      return json({ shop }, 201);
    } catch {
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

  if (request.method === 'DELETE') {
    // The merchant must send the exact shop name (the dashboard asks them to
    // type it). Checked here too, so a stray or scripted DELETE cannot wipe a shop.
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const confirmName = typeof (read.body as Record<string, unknown> | null)?.confirmName === 'string'
      ? ((read.body as Record<string, unknown>).confirmName as string).trim()
      : '';
    if (confirmName !== owned.shop.name.trim()) {
      return json({ error: 'The shop name does not match.' }, 400);
    }

    try {
      // Ownership is re-checked inside the SQL (merchant_id), shop_items go with it.
      const deleted = await deleteShopCascade(env, shopId, merchant.id);
      if (!deleted) return json({ error: 'shop_not_found' }, 404);
      return json({ ok: true });
    } catch {
      return json({ error: 'Could not delete the shop.' }, 500);
    }
  }

  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);

  const read = await readJson(request);
  if ('response' in read) return read.response;

  const parsed = await parseShopInput(env, read.body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  try {
    const shop = await updateShop(env, shopId, parsed.input);
    return json({ shop });
  } catch {
    return json({ error: 'Could not update the shop.' }, 500);
  }
}

// ---------------------------------------------------------------------------
// /api/catalog/search — public, read-only lookup, DB-backed.
// ---------------------------------------------------------------------------

async function handleCatalogSearch(request: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const items = await searchCatalogDb(env, q);
  return json({ items });
}

// ---------------------------------------------------------------------------
// /api/countries, /api/cities — public, read-only (used by shop create/edit
// forms and, later, Shops page filters).
// ---------------------------------------------------------------------------

async function handlePublicCountries(env: Env): Promise<Response> {
  await ensureSchema(env);
  const countries = await getAllCountries(env);
  return json({ countries });
}

async function handlePublicCities(request: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const url = new URL(request.url);
  const countryIdParam = url.searchParams.get('country_id');
  if (countryIdParam) {
    const cities = await getCitiesByCountry(env, Number(countryIdParam));
    return json({ cities });
  }
  const cities = await getAllCities(env);
  return json({ cities });
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

async function parseShopItemInput(env: Env, body: unknown): Promise<{ input: ShopItemInput } | { error: string }> {
  const b = (body ?? {}) as Record<string, unknown>;

  const minecraftId = typeof b.minecraftId === 'string' ? b.minecraftId.trim() : '';
  if (!minecraftId) return { error: 'Choose an item from the catalog.' };
  if (!(await catalogItemExistsDb(env, minecraftId))) return { error: 'That item is not in the Minecraft catalog.' };

  const fields = [
    'quantity', 'compactedQuantity', 'essenceQuantity',
    'sellAmount', 'sellPrice', 'buyAmount', 'buyPrice',
    'compactedSellAmount', 'compactedSellPrice', 'compactedBuyAmount', 'compactedBuyPrice',
  ] as const;

  const parsed: Record<string, number | null> = {};
  for (const field of fields) {
    const value = num(b[field]);
    if (value === 'invalid') return { error: `${field} must be a number >= 0.` };
    parsed[field] = value;
  }

  const sellConfigured = parsed.sellAmount !== null && parsed.sellPrice !== null;
  const buyConfigured = parsed.buyAmount !== null && parsed.buyPrice !== null;
  const compactedSellConfigured = parsed.compactedSellAmount !== null && parsed.compactedSellPrice !== null;
  const compactedBuyConfigured = parsed.compactedBuyAmount !== null && parsed.compactedBuyPrice !== null;

  if (!sellConfigured && !buyConfigured && !compactedSellConfigured && !compactedBuyConfigured) {
    return { error: 'Configure at least one of: sell, buy, compacted sell, compacted buy.' };
  }

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

function enrichShopItem(item: ShopItem, catalogMap: Map<string, CatalogItemRow>) {
  const catalog = catalogMap.get(item.minecraft_id);
  return {
    ...item,
    catalog: catalog ? { name: catalog.name, category: catalog.category, image_url: catalog.image_url } : null,
  };
}

async function handleShopItemsCollection(request: Request, env: Env, shopId: number): Promise<Response> {
  const result = await requireApprovedMerchant(request, env);
  if ('response' in result) return result.response;
  const { merchant } = result;

  const owned = await requireOwnedShop(env, merchant, shopId);
  if ('response' in owned) return owned.response;

  await ensureSchema(env);

  if (request.method === 'GET') {
    const items = await getShopItems(env, shopId);
    const catalogMap = await getCatalogMap(env);
    return json({ shop: owned.shop, items: items.map((i) => enrichShopItem(i, catalogMap)) });
  }

  if (request.method === 'POST') {
    const read = await readJson(request);
    if ('response' in read) return read.response;

    const parsed = await parseShopItemInput(env, read.body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);

    try {
      const item = await createShopItem(env, shopId, parsed.input);
      const catalogMap = await getCatalogMap(env);
      return json({ shop: owned.shop, item: enrichShopItem(item, catalogMap) }, 201);
    } catch {
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

  await ensureSchema(env);

  const existing = await getShopItemById(env, itemId);
  if (!existing || existing.shop_id !== shopId) return json({ error: 'Item not found.' }, 404);

  if (request.method === 'PUT') {
    const read = await readJson(request);
    if ('response' in read) return read.response;

    const parsed = await parseShopItemInput(env, read.body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);

    try {
      const item = await updateShopItem(env, itemId, parsed.input);
      const catalogMap = await getCatalogMap(env);
      return json({ item: enrichShopItem(item, catalogMap) });
    } catch {
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
// Public, read-only endpoints backing Home / Shops / Products.
// ---------------------------------------------------------------------------

async function handlePublicShops(env: Env): Promise<Response> {
  await ensureSchema(env);
  const shops = await getAllShops(env);
  return json({ shops });
}

/** `ref` is either a numeric shop id (new links) or a legacy slug (old links). */
type ShopRef = { id: number } | { slug: string };

async function resolvePublicShop(env: Env, ref: ShopRef) {
  return 'id' in ref ? getShopPublicById(env, ref.id) : getShopPublicBySlug(env, ref.slug);
}

async function handlePublicShopDetail(env: Env, ref: ShopRef): Promise<Response> {
  await ensureSchema(env);
  const shop = await resolvePublicShop(env, ref);
  if (!shop) return json({ error: 'shop_not_found' }, 404);
  return json({ shop });
}

async function handlePublicShopItems(env: Env, ref: ShopRef): Promise<Response> {
  await ensureSchema(env);
  const shop = await resolvePublicShop(env, ref);
  if (!shop) return json({ error: 'shop_not_found' }, 404);
  const items = await getShopItems(env, shop.id);
  const catalogMap = await getCatalogMap(env);
  return json({ shop, items: items.map((i) => enrichShopItem(i, catalogMap)) });
}

async function handlePublicProducts(env: Env): Promise<Response> {
  await ensureSchema(env);
  const rows = await getAllShopItemsWithShop(env);
  const catalogMap = await getCatalogMap(env);
  const items = rows.map((row) => {
    const catalog = catalogMap.get(row.minecraft_id);
    return {
      ...row,
      catalog: catalog ? { name: catalog.name, category: catalog.category, image_url: catalog.image_url } : null,
    };
  });
  return json({ items });
}

async function handlePublicProductDetail(env: Env, id: number): Promise<Response> {
  await ensureSchema(env);
  const row = await getShopItemWithShopById(env, id);
  if (!row) return json({ error: 'product_not_found' }, 404);
  const catalogMap = await getCatalogMap(env);
  const catalog = catalogMap.get(row.minecraft_id);
  return json({
    item: { ...row, catalog: catalog ? { name: catalog.name, category: catalog.category, image_url: catalog.image_url } : null },
  });
}

// ---------------------------------------------------------------------------
// /api/admin/* — merchants, catalog, countries, cities
// ---------------------------------------------------------------------------

async function handleAdminMerchants(request: Request, env: Env): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;

  if (request.method === 'GET') {
    const merchants = await getAllMerchantsAdmin(env);
    return json({ merchants });
  }
  return json({ error: 'Method not allowed.' }, 405);
}

async function handleAdminMerchantApproval(request: Request, env: Env, merchantId: number, approve: boolean): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const merchant = await setMerchantApproved(env, merchantId, approve);
  return json({ merchant });
}

function parseCatalogInput(body: unknown): { input: { minecraftId: string; name: string; category: string; imageUrl: string } } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const minecraftId = typeof b.minecraftId === 'string' ? b.minecraftId.trim() : '';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const category = typeof b.category === 'string' ? b.category.trim() : '';
  const imageUrl = typeof b.imageUrl === 'string' ? b.imageUrl.trim() : '';
  if (!minecraftId) return { error: 'minecraft_id is required.' };
  if (!name) return { error: 'Name is required.' };
  if (!category) return { error: 'Category is required.' };
  if (!imageUrl) return { error: 'Image URL is required.' };
  return { input: { minecraftId, name, category, imageUrl } };
}

async function handleAdminCatalogCollection(request: Request, env: Env): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;

  await ensureSchema(env);

  if (request.method === 'GET') {
    const items = await getAllCatalogItemsAdmin(env);
    return json({ items });
  }

  if (request.method === 'POST') {
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const parsed = parseCatalogInput(read.body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);
    try {
      const item = await createCatalogItem(env, parsed.input);
      return json({ item }, 201);
    } catch {
      return json({ error: 'Could not create the item.' }, 500);
    }
  }

  return json({ error: 'Method not allowed.' }, 405);
}

async function handleAdminCatalogItem(request: Request, env: Env, id: number): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;

  if (request.method === 'PUT') {
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const b = (read.body ?? {}) as Record<string, unknown>;
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const category = typeof b.category === 'string' ? b.category.trim() : '';
    const imageUrl = typeof b.imageUrl === 'string' ? b.imageUrl.trim() : '';
    if (!name || !category || !imageUrl) return json({ error: 'Name, category and image URL are required.' }, 400);
    const item = await updateCatalogItem(env, id, { name, category, imageUrl });
    return json({ item });
  }

  if (request.method === 'DELETE') {
    // Soft delete only: shop_items may already reference this minecraft_id.
    await setCatalogItemActive(env, id, false);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed.' }, 405);
}

async function handleAdminCatalogActivate(request: Request, env: Env, id: number): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  await setCatalogItemActive(env, id, true);
  return json({ ok: true });
}

function parseNameInput(body: unknown): { name: string } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { error: 'Name is required.' };
  return { name };
}

async function handleAdminCountriesCollection(request: Request, env: Env): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;
  await ensureSchema(env);

  if (request.method === 'GET') {
    const countries = await getAllCountries(env);
    return json({ countries });
  }

  if (request.method === 'POST') {
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const parsed = parseNameInput(read.body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);
    try {
      const country = await createCountry(env, parsed.name);
      return json({ country }, 201);
    } catch {
      return json({ error: 'Could not create the country.' }, 500);
    }
  }

  return json({ error: 'Method not allowed.' }, 405);
}

async function handleAdminCountryItem(request: Request, env: Env, id: number): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;

  if (request.method === 'PUT') {
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const parsed = parseNameInput(read.body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);
    try {
      const country = await updateCountry(env, id, parsed.name);
      return json({ country });
    } catch {
      return json({ error: 'Could not update the country.' }, 500);
    }
  }

  if (request.method === 'DELETE') {
    await deleteCountry(env, id);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed.' }, 405);
}

async function handleAdminCitiesCollection(request: Request, env: Env): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;
  await ensureSchema(env);

  if (request.method === 'GET') {
    const cities = await getAllCities(env);
    return json({ cities });
  }

  if (request.method === 'POST') {
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const b = (read.body ?? {}) as Record<string, unknown>;
    const countryId = Number(b.countryId);
    if (!Number.isFinite(countryId)) return json({ error: 'A country is required.' }, 400);
    const parsed = parseNameInput(read.body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);
    try {
      const city = await createCity(env, countryId, parsed.name);
      return json({ city }, 201);
    } catch {
      return json({ error: 'Could not create the city.' }, 500);
    }
  }

  return json({ error: 'Method not allowed.' }, 405);
}

async function handleAdminCityItem(request: Request, env: Env, id: number): Promise<Response> {
  const result = await requireAdmin(request, env);
  if ('response' in result) return result.response;

  if (request.method === 'PUT') {
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const b = (read.body ?? {}) as Record<string, unknown>;
    const countryId = Number(b.countryId);
    if (!Number.isFinite(countryId)) return json({ error: 'A country is required.' }, 400);
    const parsed = parseNameInput(read.body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);
    try {
      const city = await updateCity(env, id, countryId, parsed.name);
      return json({ city });
    } catch {
      return json({ error: 'Could not update the city.' }, 500);
    }
  }

  if (request.method === 'DELETE') {
    await deleteCity(env, id);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed.' }, 405);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === '/api/auth/discord') return handleDiscordStart(request, env);
  if (pathname === '/api/auth/discord/callback') return handleDiscordCallback(request, env);
  if (pathname === '/api/auth/logout') return handleLogout();
  if (pathname === '/api/auth/me') return handleMe(request, env);

  if (pathname === '/api/catalog/search') return handleCatalogSearch(request, env);
  if (pathname === '/api/countries') return handlePublicCountries(env);
  if (pathname === '/api/cities') return handlePublicCities(request, env);

  if (pathname === '/api/shops') return handlePublicShops(env);
  if (pathname === '/api/products') return handlePublicProducts(env);

  const publicProductMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (publicProductMatch) return handlePublicProductDetail(env, Number(publicProductMatch[1]));

  // Current links use the numeric id...
  const publicShopItemsByIdMatch = pathname.match(/^\/api\/shops\/by-id\/(\d+)\/items$/);
  if (publicShopItemsByIdMatch) return handlePublicShopItems(env, { id: Number(publicShopItemsByIdMatch[1]) });

  const publicShopByIdMatch = pathname.match(/^\/api\/shops\/by-id\/(\d+)$/);
  if (publicShopByIdMatch) return handlePublicShopDetail(env, { id: Number(publicShopByIdMatch[1]) });

  // ...legacy slug routes are kept ONLY so links shared before this change still open.
  const publicShopItemsMatch = pathname.match(/^\/api\/shops\/([a-z0-9-]+)\/items$/);
  if (publicShopItemsMatch) return handlePublicShopItems(env, { slug: publicShopItemsMatch[1] });

  const publicShopMatch = pathname.match(/^\/api\/shops\/([a-z0-9-]+)$/);
  if (publicShopMatch) return handlePublicShopDetail(env, { slug: publicShopMatch[1] });

  if (pathname === '/api/merchant/shops') return handleShopsCollection(request, env);

  const shopMatch = pathname.match(/^\/api\/merchant\/shops\/(\d+)$/);
  if (shopMatch) return handleShopRecordUpdate(request, env, Number(shopMatch[1]));

  const itemsCollectionMatch = pathname.match(/^\/api\/merchant\/shops\/(\d+)\/items$/);
  if (itemsCollectionMatch) return handleShopItemsCollection(request, env, Number(itemsCollectionMatch[1]));

  const itemDetailMatch = pathname.match(/^\/api\/merchant\/shops\/(\d+)\/items\/(\d+)$/);
  if (itemDetailMatch) {
    return handleShopItemDetail(request, env, Number(itemDetailMatch[1]), Number(itemDetailMatch[2]));
  }

  // -- Admin --
  if (pathname === '/api/admin/merchants') return handleAdminMerchants(request, env);

  const merchantApproveMatch = pathname.match(/^\/api\/admin\/merchants\/(\d+)\/approve$/);
  if (merchantApproveMatch) return handleAdminMerchantApproval(request, env, Number(merchantApproveMatch[1]), true);

  const merchantRevokeMatch = pathname.match(/^\/api\/admin\/merchants\/(\d+)\/revoke$/);
  if (merchantRevokeMatch) return handleAdminMerchantApproval(request, env, Number(merchantRevokeMatch[1]), false);

  if (pathname === '/api/admin/catalog') return handleAdminCatalogCollection(request, env);

  const catalogActivateMatch = pathname.match(/^\/api\/admin\/catalog\/(\d+)\/activate$/);
  if (catalogActivateMatch) return handleAdminCatalogActivate(request, env, Number(catalogActivateMatch[1]));

  const catalogItemMatch = pathname.match(/^\/api\/admin\/catalog\/(\d+)$/);
  if (catalogItemMatch) return handleAdminCatalogItem(request, env, Number(catalogItemMatch[1]));

  if (pathname === '/api/admin/countries') return handleAdminCountriesCollection(request, env);
  const countryItemMatch = pathname.match(/^\/api\/admin\/countries\/(\d+)$/);
  if (countryItemMatch) return handleAdminCountryItem(request, env, Number(countryItemMatch[1]));

  if (pathname === '/api/admin/cities') return handleAdminCitiesCollection(request, env);
  const cityItemMatch = pathname.match(/^\/api\/admin\/cities\/(\d+)$/);
  if (cityItemMatch) return handleAdminCityItem(request, env, Number(cityItemMatch[1]));

  // Everything else: serve the static Astro site as before.
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await route(request, env));
  },
};
