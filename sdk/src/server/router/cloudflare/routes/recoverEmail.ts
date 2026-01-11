import { parseRecoverEmailRequest } from '../../../email-recovery/emailParsers';
import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { json, readJson } from '../http';

export async function handleRecoverEmail(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method !== 'POST' || ctx.pathname !== '/recover-email') return null;

  const prefer = String(ctx.request.headers.get('prefer') || '').toLowerCase();
  const respondAsync =
    prefer.includes('respond-async') ||
    String(ctx.url.searchParams.get('async') || '').trim() === '1' ||
    String(ctx.url.searchParams.get('respond_async') || '').trim() === '1';

  const rawBody = await readJson(ctx.request);
  const parsed = parseRecoverEmailRequest(rawBody, { headers: ctx.request.headers });
  if (!parsed.ok) {
    return json({ code: parsed.code, message: parsed.message }, { status: parsed.status });
  }
  const { accountId, emailBlob, explicitMode } = parsed;

  if (!ctx.service.emailRecovery) {
    return json(
      { code: 'email_recovery_unavailable', message: 'EmailRecoveryService is not configured on this server' },
      { status: 503 }
    );
  }

  if (respondAsync && ctx.cfCtx && typeof ctx.cfCtx.waitUntil === 'function') {
    ctx.cfCtx.waitUntil(
      ctx.service.emailRecovery
        .requestEmailRecovery({ accountId, emailBlob, explicitMode })
        .then((result) => {
          ctx.logger.info('[recover-email] async complete', {
            success: result?.success === true,
            accountId,
            error: result?.success ? undefined : result?.error,
          });
        })
        .catch((err: any) => {
          ctx.logger.error('[recover-email] async error', {
            accountId,
            error: err?.message || String(err),
          });
        })
    );
    return json({ success: true, queued: true, accountId }, { status: 202 });
  }

  const result = await ctx.service.emailRecovery.requestEmailRecovery({ accountId, emailBlob, explicitMode });
  return json(result, { status: result.success ? 202 : 400 });
}
