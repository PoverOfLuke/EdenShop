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
