import { neon } from '@neondatabase/serverless';
import type { Env } from './env';

// Talks to the existing Neon tables (merchants, shops). Their structure is
// NOT changed here — only read/inserted/updated through plain SQL.

export interface Merchant {
  id: number;
  discord_user_id: string;
  discord_username: string | null;
  display_name: string | null;
  approved: boolean;
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
  created_at: string;
}

export interface ShopInput {
  name: string;
  slug: string;
  x: number | null;
  z: number | null;
  description: string | null;
  directions: string | null;
}

function getSql(env: Env) {
  return neon(env.NEON_DATABASE_URL);
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
    INSERT INTO shops (merchant_id, name, slug, x, z, description, directions)
    VALUES (${merchantId}, ${input.name}, ${input.slug}, ${input.x}, ${input.z}, ${input.description}, ${input.directions})
    RETURNING *
  `;
  return rows[0] as unknown as Shop;
}

export async function updateShop(env: Env, id: number, input: ShopInput): Promise<Shop> {
  const sql = getSql(env);
  const rows = await sql`
    UPDATE shops
    SET name = ${input.name}, slug = ${input.slug}, x = ${input.x}, z = ${input.z},
        description = ${input.description}, directions = ${input.directions}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] as unknown as Shop;
}

// ---------------------------------------------------------------------------
// shop_items — products configured within a shop. The Minecraft item
// registry itself (name/category/image) is NOT duplicated here: only
// minecraft_id is stored, and it's resolved against the static catalog
// (see catalog.ts) wherever items are read back.
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

/** Creates shop_items if it doesn't exist yet. No-op (safe) if it already does. */
export async function ensureShopItemsTable(env: Env): Promise<void> {
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
