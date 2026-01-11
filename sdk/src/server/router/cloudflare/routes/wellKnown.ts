import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { json } from '../http';

export async function handleWellKnown(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method !== 'GET') return null;
  if (ctx.pathname !== '/.well-known/webauthn' && ctx.pathname !== '/.well-known/webauthn/') return null;

  // ROR well-known manifest; allow override via env (optional)
  const contractId = (ctx.env?.ROR_CONTRACT_ID || ctx.env?.WEBAUTHN_CONTRACT_ID || '').toString().trim() || undefined;
  const methodName = (ctx.env?.ROR_METHOD || '').toString().trim() || undefined;
  const origins = await ctx.service.getRorOrigins({ contractId, method: methodName });
  return json({ origins }, { status: 200, headers: { 'Cache-Control': 'max-age=60, stale-while-revalidate=600' } });
}
