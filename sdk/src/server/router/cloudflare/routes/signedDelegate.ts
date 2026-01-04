import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { isObject, json, readJson } from '../http';

export async function handleSignedDelegate(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (!ctx.signedDelegatePath || ctx.pathname !== ctx.signedDelegatePath) return null;
  if (ctx.method !== 'POST') return null;

  const body = await readJson(ctx.request);
  const valid = isObject(body)
    && typeof (body as any).hash === 'string'
    && Boolean((body as any).hash)
    && Boolean((body as any).signedDelegate);
  if (!valid) {
    return json({ ok: false, code: 'invalid_body', message: 'Expected { hash, signedDelegate }' }, { status: 400 });
  }

  const result = await ctx.service.executeSignedDelegate({
    hash: String((body as any).hash),
    signedDelegate: (body as any).signedDelegate,
    policy: ctx.signedDelegatePolicy,
  });

  if (!result || !result.ok) {
    return json({
      ok: false,
      code: result?.code || 'delegate_execution_failed',
      message: result?.error || 'Failed to execute delegate action',
    }, { status: 400 });
  }

  return json({
    ok: true,
    relayerTxHash: result.transactionHash || null,
    status: 'submitted',
    outcome: result.outcome ?? null,
  }, { status: 200 });
}
