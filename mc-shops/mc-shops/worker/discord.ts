import type { Env } from './env';

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
}

export function buildAuthorizeUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent',
  });
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

/** Exchanges the one-time authorization code for an access token. Server-side only. */
export async function exchangeCodeForToken(env: Env, code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Discord token exchange returned no access_token');
  return data.access_token;
}

/** Fetches the logged-in Discord user. The access token is used once and then discarded. */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord user fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as DiscordUser;
  return data;
}
