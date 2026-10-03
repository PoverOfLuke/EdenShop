import { neon } from '@neondatabase/serverless';
import type { Env } from './env';

// Talks to the Neon tables. merchants/shops/shop_items structure as agreed
// with the user is never altered destructively — only additive columns
// (ADD COLUMN IF NOT EXISTS) and new tables (CREATE TABLE IF NOT EXISTS).
//
// Rule: no `SELECT *` / `RETURNING *` anywhere. Every query lists its
// columns explicitly (see the *_COLUMNS constants), so a column added to a
// table in the future is never exposed by accident.

export interface Merchant {
  id: number;
  discord_user_id: string;
  discord_username: string | null;
  display_name: string | null;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
}

/**
 * Shop as seen by its owner (merchant dashboard). The slug is deliberately
 * NOT part of this shape: slugs are generated and used only by the server.
 */
export interface Shop {
  id: number;
  merchant_id: number;
  name: string;
  x: number | null;
  z: number | null;
  description: string | null;
  directions: string | null;
  country_id: number | null;
  city_id: number | null;
  created_at: string;
}

export interface ShopInput {
  name: string;
  x: number | null;
  z: number | null;
  description: string | null;
  directions: string | null;
  countryId: number | null;
  cityId: number | null;
}

/**
 * Postgres int8 (BIGINT) columns come back from the pg protocol as JS
 * strings, not numbers — because they can exceed Number.MAX_SAFE_INTEGER.
 * Every `id`/`*_id` column here is BIGINT, so a row read straight off the
 * driver has `id: "1"`, which silently breaks every `row.shop_id === id`
 * comparison (and every `find(i => i.id === id)` in the client).
 *
 * Prices/quantities are deliberately left alone: NUMERIC columns are meant
 * to stay strings, and INTEGER columns already arrive as numbers.
 */
const BIGINT_ID_COLUMNS = ['id', 'shop_id', 'merchant_id', 'country_id', 'city_id'] as const;

const INTEGER_STRING_RE = /^-?\d+$/;

function normalizeIds<T>(rows: unknown): T {
  if (!Array.isArray(rows)) return rows as T;
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    for (const column of BIGINT_ID_COLUMNS) {
      const value = r[column];
      if (typeof value === 'string' && INTEGER_STRING_RE.test(value)) r[column] = Number(value);
    }
    return r;
  }) as T;
}

/**
 * Every query in this module goes through here, so this is the one place
 * that keeps ids numeric and the `id: number` interfaces honest.
 */
function getSql(env: Env) {
  const sql = neon(env.NEON_DATABASE_URL);

  const runTag = sql as unknown as (s: TemplateStringsArray, ...p: unknown[]) => Promise<unknown>;
  const runRaw = sql as unknown as (s: string, p?: unknown) => Promise<unknown>;

  const query = (strings: TemplateStringsArray | string, ...params: unknown[]) =>
    (typeof strings === 'string' ? runRaw(strings, params[0]) : runTag(strings, ...params)).then(normalizeIds);

  const wrapped = query as unknown as typeof sql;
  wrapped.transaction = ((...args: Parameters<typeof sql.transaction>) =>
    sql.transaction(...args).then((sets) => sets.map(normalizeIds))) as typeof sql.transaction;

  return wrapped;
}

// ---------------------------------------------------------------------------
// Slugs — generated and owned by the server. Nobody (merchant, admin, API
// client) can choose or change one: they are only ever produced here, they
// are never accepted from a request body, and they are never returned by
// the public API. Existing slugs are kept as-is so old links keep working.
// ---------------------------------------------------------------------------

function slugBase(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents: "Città" -> "Citta"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base || 'item';
}

function randomSuffix(length = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** "Red Cliff Emporium" -> "red-cliff-emporium-k3x9ab". The random tail makes it unique and never purely numeric. */
export function generateSlug(name: string): string {
  return `${slugBase(name)}-${randomSuffix()}`;
}

function isDuplicateKey(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('duplicate key');
}

const SLUG_RETRIES = 5;

// ---------------------------------------------------------------------------
// Explicit column lists. Public queries must never use SELECT *: a column
// added to a table later (sensitive or not) must not become public by accident.
// ---------------------------------------------------------------------------

/** Merchant columns used server-side for auth. */
const MERCHANT_COLUMNS = 'id, discord_user_id, discord_username, display_name, approved, is_admin, created_at';
/** Merchant columns returned to the Admin panel (no Discord user id). */
const MERCHANT_ADMIN_COLUMNS = 'id, discord_username, display_name, approved, is_admin, created_at';
/** Shop columns for the owner's dashboard (no slug). */
const SHOP_OWNER_COLUMNS = 'id, merchant_id, name, x, z, description, directions, country_id, city_id, created_at';
/** Shop columns safe to expose publicly (no slug, no merchant_id), aliased with `s.`. */
const SHOP_PUBLIC_COLUMNS = 's.id, s.name, s.x, s.z, s.description, s.directions, s.country_id, s.city_id, s.created_at';
const COUNTRY_COLUMNS = 'id, name, created_at';
const CITY_COLUMNS = 'id, country_id, name, created_at';
const CATALOG_COLUMNS = 'id, minecraft_id, name, category, image_url, active, created_at';
const SHOP_ITEM_COLUMNS =
  'id, shop_id, minecraft_id, quantity, compacted_quantity, essence_quantity, sell_amount, sell_price, buy_amount, buy_price, ' +
  'compacted_sell_amount, compacted_sell_price, compacted_buy_amount, compacted_buy_price, created_at';
const SHOP_ITEM_COLUMNS_SI = SHOP_ITEM_COLUMNS.split(', ').map((c) => `si.${c}`).join(', ');

// ---------------------------------------------------------------------------
// Schema bootstrap — idempotent, additive only. Safe to call on every
// request that touches one of these tables/columns; Postgres no-ops the
// IF NOT EXISTS / ADD COLUMN IF NOT EXISTS statements once applied.
// ---------------------------------------------------------------------------

let schemaEnsured = false;

export async function ensureSchema(env: Env): Promise<void> {
  if (schemaEnsured) return; // one check per Worker instance is enough
  const sql = getSql(env);

  await sql`
    CREATE TABLE IF NOT EXISTS shop_items (
      id BIGSERIAL PRIMARY KEY,
      shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      minecraft_id TEXT NOT NULL,
      quantity INTEGER,
      compacted_quantity INTEGER,
      essence_quantity NUMERIC(12, 2),
      sell_amount INTEGER,
      sell_price NUMERIC(12, 2),
      buy_amount INTEGER,
      buy_price NUMERIC(12, 2),
      compacted_sell_amount INTEGER,
      compacted_sell_price NUMERIC(12, 2),
      compacted_buy_amount INTEGER,
      compacted_buy_price NUMERIC(12, 2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, minecraft_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS countries (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cities (
      id BIGSERIAL PRIMARY KEY,
      country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (country_id, slug)
    )
  `;

  await sql`ALTER TABLE shops ADD COLUMN IF NOT EXISTS country_id BIGINT REFERENCES countries(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE shops ADD COLUMN IF NOT EXISTS city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_items (
      id BIGSERIAL PRIMARY KEY,
      minecraft_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
}

/** Finds the merchant by discord_user_id, creating it (approved = false) if new. */
export async function upsertMerchant(
  env: Env,
  discordUserId: string,
  discordUsername: string,
  displayName: string
): Promise<Merchant> {
  const sql = getSql(env);
  const rows = await sql`
    INSERT INTO merchants (discord_user_id, discord_username, display_name)
    VALUES (${discordUserId}, ${discordUsername}, ${displayName})
    ON CONFLICT (discord_user_id)
    DO UPDATE SET discord_username = EXCLUDED.discord_username, display_name = EXCLUDED.display_name
    RETURNING id, discord_user_id, discord_username, display_name, approved, is_admin, created_at
  `;
  return rows[0] as unknown as Merchant;
}

export async function getMerchantById(env: Env, id: number): Promise<Merchant | null> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${MERCHANT_COLUMNS} FROM merchants WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as unknown as Merchant) ?? null;
}

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

/** Public shop shape: no slug, no merchant_id. */
export interface ShopPublic {
  id: number;
  name: string;
  x: number | null;
  z: number | null;
  description: string | null;
  directions: string | null;
  country_id: number | null;
  city_id: number | null;
  created_at: string;
  country_name: string | null;
  city_name: string | null;
}

const SHOP_PUBLIC_SELECT = `
  SELECT ${SHOP_PUBLIC_COLUMNS}, c.name AS country_name, ci.name AS city_name
  FROM shops s
  LEFT JOIN countries c ON c.id = s.country_id
  LEFT JOIN cities ci ON ci.id = s.city_id`;

/** All shops, with country/city names resolved, for the public Shops/Home pages. */
export async function getAllShops(env: Env): Promise<ShopPublic[]> {
  const sql = getSql(env);
  const rows = await sql(`${SHOP_PUBLIC_SELECT} ORDER BY s.created_at DESC`, []);
  return rows as unknown as ShopPublic[];
}

export async function getShopPublicById(env: Env, id: number): Promise<ShopPublic | null> {
  const sql = getSql(env);
  const rows = await sql(`${SHOP_PUBLIC_SELECT} WHERE s.id = $1 LIMIT 1`, [id]);
  return (rows[0] as unknown as ShopPublic) ?? null;
}

/**
 * LEGACY lookup, kept only so old `/shops/detail?slug=...` links keep
 * working. The page resolves the slug once and then switches the address
 * bar to the numeric id; the slug itself is never returned to the client.
 */
export async function getShopPublicBySlug(env: Env, slug: string): Promise<ShopPublic | null> {
  const sql = getSql(env);
  const rows = await sql(`${SHOP_PUBLIC_SELECT} WHERE s.slug = $1 LIMIT 1`, [slug]);
  return (rows[0] as unknown as ShopPublic) ?? null;
}

export async function getShopsByMerchant(env: Env, merchantId: number): Promise<Shop[]> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${SHOP_OWNER_COLUMNS} FROM shops WHERE merchant_id = $1 ORDER BY created_at ASC`, [merchantId]);
  return rows as unknown as Shop[];
}

export async function getShopById(env: Env, id: number): Promise<Shop | null> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${SHOP_OWNER_COLUMNS} FROM shops WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as unknown as Shop) ?? null;
}

/** The slug is generated here; on the (very unlikely) collision a new one is drawn. */
export async function createShop(env: Env, merchantId: number, input: ShopInput): Promise<Shop> {
  const sql = getSql(env);
  let lastError: unknown;
  for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
    const slug = generateSlug(input.name);
    try {
      const rows = await sql(
        `INSERT INTO shops (merchant_id, name, slug, x, z, description, directions, country_id, city_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${SHOP_OWNER_COLUMNS}`,
        [merchantId, input.name, slug, input.x, input.z, input.description, input.directions, input.countryId, input.cityId]
      );
      return rows[0] as unknown as Shop;
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

/** The slug is intentionally NOT updated: it stays stable for the whole life of the shop. */
export async function updateShop(env: Env, id: number, input: ShopInput): Promise<Shop> {
  const sql = getSql(env);
  const rows = await sql(
    `UPDATE shops
     SET name = $1, x = $2, z = $3, description = $4, directions = $5, country_id = $6, city_id = $7
     WHERE id = $8
     RETURNING ${SHOP_OWNER_COLUMNS}`,
    [input.name, input.x, input.z, input.description, input.directions, input.countryId, input.cityId, id]
  );
  return rows[0] as unknown as Shop;
}

/**
 * Deletes a shop AND all of its shop_items, atomically, in ONE statement.
 *
 * Ownership is enforced inside the SQL itself (`merchant_id = $2`), on top
 * of the check done by the route: even if a caller forgot to check, a
 * merchant can never delete somebody else's shop. The items are removed
 * explicitly instead of relying on ON DELETE CASCADE, because that FK may
 * not exist on a table created by an older version of the app.
 *
 * Returns true if a shop was deleted, false if nothing matched.
 */
export async function deleteShopCascade(env: Env, shopId: number, merchantId: number): Promise<boolean> {
  const sql = getSql(env);
  const rows = await sql(
    `WITH owned AS (
       SELECT id FROM shops WHERE id = $1 AND merchant_id = $2
     ),
     removed_items AS (
       DELETE FROM shop_items WHERE shop_id IN (SELECT id FROM owned)
     )
     DELETE FROM shops WHERE id IN (SELECT id FROM owned)
     RETURNING id`,
    [shopId, merchantId]
  );
  return Array.isArray(rows) && rows.length > 0;
}

// ---------------------------------------------------------------------------
// Countries / Cities — managed by Admin, selected (read-only) by merchants
// ---------------------------------------------------------------------------

// Country / city slugs follow the same rule as shop slugs: generated by the
// server, kept stable on rename, never exposed.

export interface Country {
  id: number;
  name: string;
  created_at: string;
}

export interface City {
  id: number;
  country_id: number;
  name: string;
  created_at: string;
}

export async function getAllCountries(env: Env): Promise<Country[]> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${COUNTRY_COLUMNS} FROM countries ORDER BY name ASC`, []);
  return rows as unknown as Country[];
}

export async function createCountry(env: Env, name: string): Promise<Country> {
  const sql = getSql(env);
  let lastError: unknown;
  for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
    try {
      const rows = await sql(
        `INSERT INTO countries (name, slug) VALUES ($1, $2) RETURNING ${COUNTRY_COLUMNS}`,
        [name, generateSlug(name)]
      );
      return rows[0] as unknown as Country;
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

export async function updateCountry(env: Env, id: number, name: string): Promise<Country> {
  const sql = getSql(env);
  const rows = await sql(`UPDATE countries SET name = $1 WHERE id = $2 RETURNING ${COUNTRY_COLUMNS}`, [name, id]);
  return rows[0] as unknown as Country;
}

export async function deleteCountry(env: Env, id: number): Promise<void> {
  const sql = getSql(env);
  await sql`DELETE FROM countries WHERE id = ${id}`;
}

export async function getAllCities(env: Env): Promise<City[]> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${CITY_COLUMNS} FROM cities ORDER BY name ASC`, []);
  return rows as unknown as City[];
}

export async function getCitiesByCountry(env: Env, countryId: number): Promise<City[]> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${CITY_COLUMNS} FROM cities WHERE country_id = $1 ORDER BY name ASC`, [countryId]);
  return rows as unknown as City[];
}

export async function getCityById(env: Env, id: number): Promise<City | null> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${CITY_COLUMNS} FROM cities WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as unknown as City) ?? null;
}

export async function createCity(env: Env, countryId: number, name: string): Promise<City> {
  const sql = getSql(env);
  let lastError: unknown;
  for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
    try {
      const rows = await sql(
        `INSERT INTO cities (country_id, name, slug) VALUES ($1, $2, $3) RETURNING ${CITY_COLUMNS}`,
        [countryId, name, generateSlug(name)]
      );
      return rows[0] as unknown as City;
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

export async function updateCity(env: Env, id: number, countryId: number, name: string): Promise<City> {
  const sql = getSql(env);
  const rows = await sql(
    `UPDATE cities SET country_id = $1, name = $2 WHERE id = $3 RETURNING ${CITY_COLUMNS}`,
    [countryId, name, id]
  );
  return rows[0] as unknown as City;
}

export async function deleteCity(env: Env, id: number): Promise<void> {
  const sql = getSql(env);
  await sql`DELETE FROM cities WHERE id = ${id}`;
}

// ---------------------------------------------------------------------------
// Catalog — Minecraft item registry, now DB-backed so Admin can manage it.
// ---------------------------------------------------------------------------

export interface CatalogItemRow {
  id: number;
  minecraft_id: string;
  name: string;
  category: string;
  image_url: string;
  active: boolean;
  created_at: string;
}

export async function catalogItemExistsDb(env: Env, minecraftId: string): Promise<boolean> {
  const map = await getCatalogMap(env);
  return map.has(minecraftId) && (map.get(minecraftId) as CatalogItemRow).active;
}

export async function searchCatalogDb(env: Env, query: string, limit = 30): Promise<CatalogItemRow[]> {
  const sql = getSql(env);
  const q = `%${query.trim().toLowerCase()}%`;
  const rows = await sql(
    `SELECT ${CATALOG_COLUMNS} FROM catalog_items
     WHERE active = TRUE AND (LOWER(name) LIKE $1 OR LOWER(minecraft_id) LIKE $1)
     ORDER BY name ASC
     LIMIT $2`,
    [q, limit]
  );
  return rows as unknown as CatalogItemRow[];
}

// In-memory cache of the whole catalog, keyed by minecraft_id. The table
// only changes when an Admin edits it, so re-fetching on every single
// product lookup would be wasteful; this is invalidated right after any
// Admin catalog mutation and otherwise lives for the Worker instance's
// lifetime (a fresh instance just refetches once, lazily).
let catalogCache: Map<string, CatalogItemRow> | null = null;

export async function getCatalogMap(env: Env): Promise<Map<string, CatalogItemRow>> {
  if (catalogCache) return catalogCache;
  const sql = getSql(env);
  const rows = (await sql(`SELECT ${CATALOG_COLUMNS} FROM catalog_items`, [])) as unknown as CatalogItemRow[];
  catalogCache = new Map(rows.map((r) => [r.minecraft_id, r]));
  return catalogCache;
}

function invalidateCatalogCache(): void {
  catalogCache = null;
}

/** Admin listing — includes inactive items too. */
export async function getAllCatalogItemsAdmin(env: Env): Promise<CatalogItemRow[]> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${CATALOG_COLUMNS} FROM catalog_items ORDER BY name ASC`, []);
  return rows as unknown as CatalogItemRow[];
}

export async function createCatalogItem(
  env: Env,
  input: { minecraftId: string; name: string; category: string; imageUrl: string }
): Promise<CatalogItemRow> {
  const sql = getSql(env);
  const rows = await sql`
    INSERT INTO catalog_items (minecraft_id, name, category, image_url)
    VALUES (${input.minecraftId}, ${input.name}, ${input.category}, ${input.imageUrl})
    RETURNING id, minecraft_id, name, category, image_url, active, created_at
  `;
  invalidateCatalogCache();
  return rows[0] as unknown as CatalogItemRow;
}

export async function updateCatalogItem(
  env: Env,
  id: number,
  input: { name: string; category: string; imageUrl: string }
): Promise<CatalogItemRow> {
  const sql = getSql(env);
  const rows = await sql`
    UPDATE catalog_items SET name = ${input.name}, category = ${input.category}, image_url = ${input.imageUrl}
    WHERE id = ${id}
    RETURNING id, minecraft_id, name, category, image_url, active, created_at
  `;
  invalidateCatalogCache();
  return rows[0] as unknown as CatalogItemRow;
}

export async function setCatalogItemActive(env: Env, id: number, active: boolean): Promise<void> {
  const sql = getSql(env);
  await sql`UPDATE catalog_items SET active = ${active} WHERE id = ${id}`;
  invalidateCatalogCache();
}

// ---------------------------------------------------------------------------
// shop_items — products configured within a shop. Links to catalog_items
// via minecraft_id (not a hard FK, to avoid migration risk — validated at
// the application layer against catalog_items instead).
// ---------------------------------------------------------------------------

export interface ShopItem {
  id: number;
  shop_id: number;
  minecraft_id: string;
  quantity: number | null;
  compacted_quantity: number | null;
  essence_quantity: string | null;
  sell_amount: number | null;
  sell_price: string | null;
  buy_amount: number | null;
  buy_price: string | null;
  compacted_sell_amount: number | null;
  compacted_sell_price: string | null;
  compacted_buy_amount: number | null;
  compacted_buy_price: string | null;
  created_at: string;
}

export interface ShopItemInput {
  minecraftId: string;
  quantity: number | null;
  compactedQuantity: number | null;
  essenceQuantity: number | null;
  sellAmount: number | null;
  sellPrice: number | null;
  buyAmount: number | null;
  buyPrice: number | null;
  compactedSellAmount: number | null;
  compactedSellPrice: number | null;
  compactedBuyAmount: number | null;
  compactedBuyPrice: number | null;
}

export async function getShopItems(env: Env, shopId: number): Promise<ShopItem[]> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${SHOP_ITEM_COLUMNS} FROM shop_items WHERE shop_id = $1 ORDER BY created_at ASC`, [shopId]);
  return rows as unknown as ShopItem[];
}

export async function getShopItemById(env: Env, id: number): Promise<ShopItem | null> {
  const sql = getSql(env);
  const rows = await sql(`SELECT ${SHOP_ITEM_COLUMNS} FROM shop_items WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as unknown as ShopItem) ?? null;
}

export async function createShopItem(env: Env, shopId: number, input: ShopItemInput): Promise<ShopItem> {
  const sql = getSql(env);
  const rows = await sql`
    INSERT INTO shop_items (
      shop_id, minecraft_id, quantity, compacted_quantity, essence_quantity,
      sell_amount, sell_price, buy_amount, buy_price,
      compacted_sell_amount, compacted_sell_price, compacted_buy_amount, compacted_buy_price
    ) VALUES (
      ${shopId}, ${input.minecraftId}, ${input.quantity}, ${input.compactedQuantity}, ${input.essenceQuantity},
      ${input.sellAmount}, ${input.sellPrice}, ${input.buyAmount}, ${input.buyPrice},
      ${input.compactedSellAmount}, ${input.compactedSellPrice}, ${input.compactedBuyAmount}, ${input.compactedBuyPrice}
    )
    RETURNING id, shop_id, minecraft_id, quantity, compacted_quantity, essence_quantity, sell_amount, sell_price, buy_amount, buy_price,
      compacted_sell_amount, compacted_sell_price, compacted_buy_amount, compacted_buy_price, created_at
  `;
  return rows[0] as unknown as ShopItem;
}

export async function updateShopItem(env: Env, id: number, input: ShopItemInput): Promise<ShopItem> {
  const sql = getSql(env);
  const rows = await sql`
    UPDATE shop_items SET
      minecraft_id = ${input.minecraftId},
      quantity = ${input.quantity},
      compacted_quantity = ${input.compactedQuantity},
      essence_quantity = ${input.essenceQuantity},
      sell_amount = ${input.sellAmount},
      sell_price = ${input.sellPrice},
      buy_amount = ${input.buyAmount},
      buy_price = ${input.buyPrice},
      compacted_sell_amount = ${input.compactedSellAmount},
      compacted_sell_price = ${input.compactedSellPrice},
      compacted_buy_amount = ${input.compactedBuyAmount},
      compacted_buy_price = ${input.compactedBuyPrice}
    WHERE id = ${id}
    RETURNING id, shop_id, minecraft_id, quantity, compacted_quantity, essence_quantity, sell_amount, sell_price, buy_amount, buy_price,
      compacted_sell_amount, compacted_sell_price, compacted_buy_amount, compacted_buy_price, created_at
  `;
  return rows[0] as unknown as ShopItem;
}

export async function deleteShopItem(env: Env, id: number): Promise<void> {
  const sql = getSql(env);
  await sql`DELETE FROM shop_items WHERE id = ${id}`;
}

// -- Public, read-only, joined views for Home / Shops / Products pages --

export interface ShopItemWithShop extends ShopItem {
  shop_name: string;
  shop_x: number | null;
  shop_z: number | null;
}

/** Every configured product across every shop, for the public Products page. */
export async function getAllShopItemsWithShop(env: Env): Promise<ShopItemWithShop[]> {
  const sql = getSql(env);
  const rows = await sql(
    `SELECT ${SHOP_ITEM_COLUMNS_SI}, s.name AS shop_name, s.x AS shop_x, s.z AS shop_z
     FROM shop_items si
     JOIN shops s ON s.id = si.shop_id
     ORDER BY si.created_at DESC`,
    []
  );
  return rows as unknown as ShopItemWithShop[];
}

export async function getShopItemWithShopById(env: Env, id: number): Promise<ShopItemWithShop | null> {
  const sql = getSql(env);
  const rows = await sql(
    `SELECT ${SHOP_ITEM_COLUMNS_SI}, s.name AS shop_name, s.x AS shop_x, s.z AS shop_z
     FROM shop_items si
     JOIN shops s ON s.id = si.shop_id
     WHERE si.id = $1
     LIMIT 1`,
    [id]
  );
  return (rows[0] as unknown as ShopItemWithShop) ?? null;
}

// ---------------------------------------------------------------------------
// Admin — merchants
// ---------------------------------------------------------------------------

/** What the Admin panel is allowed to see about a merchant (no Discord user id). */
export interface MerchantAdminRow {
  id: number;
  discord_username: string | null;
  display_name: string | null;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface MerchantWithShopCount extends MerchantAdminRow {
  shop_count: number;
}

export async function getAllMerchantsAdmin(env: Env): Promise<MerchantWithShopCount[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT m.id, m.discord_username, m.display_name, m.approved, m.is_admin, m.created_at,
           COUNT(s.id)::int AS shop_count
    FROM merchants m
    LEFT JOIN shops s ON s.merchant_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `;
  return rows as unknown as MerchantWithShopCount[];
}

export async function setMerchantApproved(env: Env, id: number, approved: boolean): Promise<MerchantAdminRow> {
  const sql = getSql(env);
  const rows = await sql`
    UPDATE merchants SET approved = ${approved} WHERE id = ${id}
    RETURNING id, discord_username, display_name, approved, is_admin, created_at
  `;
  return rows[0] as unknown as MerchantAdminRow;
}
