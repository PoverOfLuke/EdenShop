import { neon } from '@neondatabase/serverless';
import type { Env } from './env';
import { staticCatalogItems } from './catalog';

// Talks to the Neon tables. merchants/shops/shop_items structure as agreed
// with the user is never altered destructively — only additive columns
// (ADD COLUMN IF NOT EXISTS) and new tables (CREATE TABLE IF NOT EXISTS).

export interface Merchant {
  id: number;
  discord_user_id: string;
  discord_username: string | null;
  display_name: string | null;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface Shop {
  id: number;
  merchant_id: number;
  name: string;
  slug: string;
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
  slug: string;
  x: number | null;
  z: number | null;
  description: string | null;
  directions: string | null;
  countryId: number | null;
  cityId: number | null;
}

function getSql(env: Env) {
  return neon(env.NEON_DATABASE_URL);
}

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
    RETURNING *
  `;
  return rows[0] as unknown as Merchant;
}

export async function getMerchantById(env: Env, id: number): Promise<Merchant | null> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM merchants WHERE id = ${id} LIMIT 1`;
  return (rows[0] as unknown as Merchant) ?? null;
}

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

export interface ShopPublic extends Shop {
  country_name: string | null;
  city_name: string | null;
}

/** All shops, with country/city names resolved, for the public Shops/Home pages. */
export async function getAllShops(env: Env): Promise<ShopPublic[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT s.*, c.name AS country_name, ci.name AS city_name
    FROM shops s
    LEFT JOIN countries c ON c.id = s.country_id
    LEFT JOIN cities ci ON ci.id = s.city_id
    ORDER BY s.created_at DESC
  `;
  return rows as unknown as ShopPublic[];
}

export async function getShopBySlug(env: Env, slug: string): Promise<ShopPublic | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT s.*, c.name AS country_name, ci.name AS city_name
    FROM shops s
    LEFT JOIN countries c ON c.id = s.country_id
    LEFT JOIN cities ci ON ci.id = s.city_id
    WHERE s.slug = ${slug}
    LIMIT 1
  `;
  return (rows[0] as unknown as ShopPublic) ?? null;
}

export async function getShopsByMerchant(env: Env, merchantId: number): Promise<Shop[]> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM shops WHERE merchant_id = ${merchantId} ORDER BY created_at ASC`;
  return rows as unknown as Shop[];
}

export async function getShopById(env: Env, id: number): Promise<Shop | null> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM shops WHERE id = ${id} LIMIT 1`;
  return (rows[0] as unknown as Shop) ?? null;
}

export async function createShop(env: Env, merchantId: number, input: ShopInput): Promise<Shop> {
  const sql = getSql(env);
  const rows = await sql`
    INSERT INTO shops (merchant_id, name, slug, x, z, description, directions, country_id, city_id)
    VALUES (${merchantId}, ${input.name}, ${input.slug}, ${input.x}, ${input.z}, ${input.description}, ${input.directions}, ${input.countryId}, ${input.cityId})
    RETURNING *
  `;
  return rows[0] as unknown as Shop;
}

export async function updateShop(env: Env, id: number, input: ShopInput): Promise<Shop> {
  const sql = getSql(env);
  const rows = await sql`
    UPDATE shops
    SET name = ${input.name}, slug = ${input.slug}, x = ${input.x}, z = ${input.z},
        description = ${input.description}, directions = ${input.directions},
        country_id = ${input.countryId}, city_id = ${input.cityId}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] as unknown as Shop;
}

// ---------------------------------------------------------------------------
// Countries / Cities — managed by Admin, selected (read-only) by merchants
// ---------------------------------------------------------------------------

export interface Country {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export interface City {
  id: number;
  country_id: number;
  name: string;
  slug: string;
  created_at: string;
}

export async function getAllCountries(env: Env): Promise<Country[]> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM countries ORDER BY name ASC`;
  return rows as unknown as Country[];
}

export async function createCountry(env: Env, name: string, slug: string): Promise<Country> {
  const sql = getSql(env);
  const rows = await sql`INSERT INTO countries (name, slug) VALUES (${name}, ${slug}) RETURNING *`;
  return rows[0] as unknown as Country;
}

export async function updateCountry(env: Env, id: number, name: string, slug: string): Promise<Country> {
  const sql = getSql(env);
  const rows = await sql`UPDATE countries SET name = ${name}, slug = ${slug} WHERE id = ${id} RETURNING *`;
  return rows[0] as unknown as Country;
}

export async function deleteCountry(env: Env, id: number): Promise<void> {
  const sql = getSql(env);
  await sql`DELETE FROM countries WHERE id = ${id}`;
}

export async function getAllCities(env: Env): Promise<City[]> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM cities ORDER BY name ASC`;
  return rows as unknown as City[];
}

export async function getCitiesByCountry(env: Env, countryId: number): Promise<City[]> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM cities WHERE country_id = ${countryId} ORDER BY name ASC`;
  return rows as unknown as City[];
}

export async function getCityById(env: Env, id: number): Promise<City | null> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM cities WHERE id = ${id} LIMIT 1`;
  return (rows[0] as unknown as City) ?? null;
}

export async function createCity(env: Env, countryId: number, name: string, slug: string): Promise<City> {
  const sql = getSql(env);
  const rows = await sql`INSERT INTO cities (country_id, name, slug) VALUES (${countryId}, ${name}, ${slug}) RETURNING *`;
  return rows[0] as unknown as City;
}

export async function updateCity(env: Env, id: number, countryId: number, name: string, slug: string): Promise<City> {
  const sql = getSql(env);
  const rows = await sql`UPDATE cities SET country_id = ${countryId}, name = ${name}, slug = ${slug} WHERE id = ${id} RETURNING *`;
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

/** Rows per INSERT statement. 1505 items / 8 statements instead of 1505. */
const CATALOG_IMPORT_CHUNK = 200;

/**
 * One-time (re-runnable, idempotent) import of the bundled static catalog
 * into Neon.
 *
 * Batched multi-row INSERTs on purpose: the neon serverless driver talks to
 * Neon over HTTP, so one insert per item would be ~1500 subrequests in a
 * single Worker invocation — past the Cloudflare per-invocation limit, which
 * kills the Worker mid-import and returns a non-JSON error to the browser.
 */
export async function importStaticCatalog(env: Env): Promise<{ inserted: number; total: number }> {
  const sql = getSql(env);
  const total = staticCatalogItems.length;
  let inserted = 0;

  for (let start = 0; start < total; start += CATALOG_IMPORT_CHUNK) {
    const chunk = staticCatalogItems.slice(start, start + CATALOG_IMPORT_CHUNK);
    const placeholders: string[] = [];
    const params: string[] = [];

    for (const item of chunk) {
      placeholders.push(`($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4})`);
      params.push(item.minecraft_id, item.name, item.category, item.image_url);
    }

    const rows = (await sql(
      `INSERT INTO catalog_items (minecraft_id, name, category, image_url)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (minecraft_id) DO NOTHING
       RETURNING id`,
      params
    )) as unknown as { id: number }[];

    inserted += rows.length;
  }

  invalidateCatalogCache();
  return { inserted, total };
}

export async function catalogItemExistsDb(env: Env, minecraftId: string): Promise<boolean> {
  const map = await getCatalogMap(env);
  return map.has(minecraftId) && (map.get(minecraftId) as CatalogItemRow).active;
}

export async function searchCatalogDb(env: Env, query: string, limit = 30): Promise<CatalogItemRow[]> {
  const sql = getSql(env);
  const q = `%${query.trim().toLowerCase()}%`;
  const rows = await sql`
    SELECT * FROM catalog_items
    WHERE active = TRUE AND (LOWER(name) LIKE ${q} OR LOWER(minecraft_id) LIKE ${q})
    ORDER BY name ASC
    LIMIT ${limit}
  `;
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
  const rows = (await sql`SELECT * FROM catalog_items`) as unknown as CatalogItemRow[];
  catalogCache = new Map(rows.map((r) => [r.minecraft_id, r]));
  return catalogCache;
}

function invalidateCatalogCache(): void {
  catalogCache = null;
}

/** Admin listing — includes inactive items too. */
export async function getAllCatalogItemsAdmin(env: Env): Promise<CatalogItemRow[]> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM catalog_items ORDER BY name ASC`;
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
    RETURNING *
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
    RETURNING *
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
  const rows = await sql`SELECT * FROM shop_items WHERE shop_id = ${shopId} ORDER BY created_at ASC`;
  return rows as unknown as ShopItem[];
}

export async function getShopItemById(env: Env, id: number): Promise<ShopItem | null> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM shop_items WHERE id = ${id} LIMIT 1`;
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
    RETURNING *
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
    RETURNING *
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
  shop_slug: string;
  shop_x: number | null;
  shop_z: number | null;
}

/** Every configured product across every shop, for the public Products page. */
export async function getAllShopItemsWithShop(env: Env): Promise<ShopItemWithShop[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT si.*, s.name AS shop_name, s.slug AS shop_slug, s.x AS shop_x, s.z AS shop_z
    FROM shop_items si
    JOIN shops s ON s.id = si.shop_id
    ORDER BY si.created_at DESC
  `;
  return rows as unknown as ShopItemWithShop[];
}

export async function getShopItemWithShopById(env: Env, id: number): Promise<ShopItemWithShop | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT si.*, s.name AS shop_name, s.slug AS shop_slug, s.x AS shop_x, s.z AS shop_z
    FROM shop_items si
    JOIN shops s ON s.id = si.shop_id
    WHERE si.id = ${id}
    LIMIT 1
  `;
  return (rows[0] as unknown as ShopItemWithShop) ?? null;
}

// ---------------------------------------------------------------------------
// Admin — merchants
// ---------------------------------------------------------------------------

export interface MerchantWithShopCount extends Merchant {
  shop_count: number;
}

export async function getAllMerchantsAdmin(env: Env): Promise<MerchantWithShopCount[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT m.*, COUNT(s.id)::int AS shop_count
    FROM merchants m
    LEFT JOIN shops s ON s.merchant_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `;
  return rows as unknown as MerchantWithShopCount[];
}

export async function setMerchantApproved(env: Env, id: number, approved: boolean): Promise<Merchant> {
  const sql = getSql(env);
  const rows = await sql`UPDATE merchants SET approved = ${approved} WHERE id = ${id} RETURNING *`;
  return rows[0] as unknown as Merchant;
}
