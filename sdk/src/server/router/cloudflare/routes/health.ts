import { buildCorsOrigins } from '../../../core/SessionService';
import { handleGetShamirKeyInfo } from '../../../core/shamirHandlers';
import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { json } from '../http';

export async function handleHealth(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (!ctx.opts.healthz || ctx.method !== 'GET' || ctx.pathname !== '/healthz') return null;

  // Surface simple CORS info for diagnostics (normalized)
  const allowed = buildCorsOrigins(...(ctx.opts.corsOrigins || []));
  const corsAllowed = allowed === '*' ? '*' : allowed;
  const shamir = ctx.service.shamirService;
  const shamirConfigured = Boolean(shamir && shamir.hasShamir());
  let currentKeyId: string | null = null;
  if (shamirConfigured && shamir) {
    try {
      const { currentKeyId: id } = JSON.parse((await handleGetShamirKeyInfo(shamir)).body) as { currentKeyId?: string };
      currentKeyId = id || null;
    } catch { }
  }

  const proverBaseUrl = ctx.service.emailRecovery?.getZkEmailProverBaseUrl?.() ?? null;
  const zkEmailConfigured = Boolean(proverBaseUrl);

  return json({
    ok: true,
    // Backwards-compatible field (was previously top-level).
    currentKeyId,
    shamir: { configured: shamirConfigured, currentKeyId },
    zkEmail: { configured: zkEmailConfigured, proverBaseUrl },
    cors: { allowedOrigins: corsAllowed },
  }, { status: 200 });
}

export async function handleReady(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (!ctx.opts.readyz || ctx.method !== 'GET' || ctx.pathname !== '/readyz') return null;

  const allowed = buildCorsOrigins(...(ctx.opts.corsOrigins || []));
  const corsAllowed = allowed === '*' ? '*' : allowed;

  const shamir = ctx.service.shamirService;
  const shamirConfigured = Boolean(shamir && shamir.hasShamir());

  let shamirReady: boolean | null = null;
  let shamirCurrentKeyId: string | null = null;
  let shamirError: string | undefined;
  if (shamirConfigured && shamir) {
    try {
      await shamir.ensureReady();
      shamirReady = true;
      const { currentKeyId } = JSON.parse((await handleGetShamirKeyInfo(shamir)).body) as { currentKeyId?: string };
      shamirCurrentKeyId = currentKeyId || null;
    } catch (e: any) {
      shamirReady = false;
      shamirError = e?.message || String(e);
    }
  }

  const zk = ctx.service.emailRecovery
    ? await ctx.service.emailRecovery.checkZkEmailProverHealth()
    : { configured: false, baseUrl: null, healthy: null as boolean | null };

  const ok =
    (shamirConfigured ? shamirReady === true : true) &&
    (zk.configured ? zk.healthy === true : true);

  return json({
    ok,
    shamir: {
      configured: shamirConfigured,
      ready: shamirConfigured ? shamirReady : null,
      currentKeyId: shamirCurrentKeyId,
      error: shamirError,
    },
    zkEmail: zk,
    cors: { allowedOrigins: corsAllowed },
  }, { status: ok ? 200 : 503 });
}
