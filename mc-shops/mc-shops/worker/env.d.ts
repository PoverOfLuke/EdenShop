/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // Static assets produced by `astro build` (dist/)
  ASSETS: Fetcher;

  // Discord OAuth2 app (already configured on Cloudflare)
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;

  // HMAC key used to sign the EdenShop session cookie (new secret,
  // add with: npx wrangler secret put SESSION_SECRET)
  SESSION_SECRET: string;

  // Neon connection string, used only by this Worker (separate from
  // whatever the Python scraper's GitHub Action uses).
  NEON_DATABASE_URL: string;
}
