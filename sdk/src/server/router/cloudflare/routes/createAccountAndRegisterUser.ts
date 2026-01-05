import type { CreateAccountAndRegisterRequest, CreateAccountAndRegisterResult } from '../../../core/types';
import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { isObject, json, readJson } from '../http';

export async function handleCreateAccountAndRegisterUser(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method !== 'POST' || ctx.pathname !== '/create_account_and_register_user') return null;

  const body = await readJson(ctx.request);
  if (!isObject(body)) {
    return json({ code: 'invalid_body', message: 'JSON body required' }, { status: 400 });
  }

  const new_account_id = typeof body.new_account_id === 'string' ? body.new_account_id : '';
  const new_public_key = typeof body.new_public_key === 'string' ? body.new_public_key : '';
  const threshold_ed25519 = isObject((body as Record<string, unknown>).threshold_ed25519)
    ? (body as Record<string, unknown>).threshold_ed25519
    : undefined;
  const vrf_data = isObject(body.vrf_data) ? body.vrf_data : null;
  const webauthn_registration = isObject(body.webauthn_registration) ? body.webauthn_registration : null;
  const deterministic_vrf_public_key = (body as Record<string, unknown>).deterministic_vrf_public_key;
  const authenticator_options = isObject((body as Record<string, unknown>).authenticator_options)
    ? (body as Record<string, unknown>).authenticator_options
    : undefined;

  if (!new_account_id) {
    return json({ code: 'invalid_body', message: 'Missing or invalid new_account_id' }, { status: 400 });
  }
  if (!new_public_key) {
    return json({ code: 'invalid_body', message: 'Missing or invalid new_public_key' }, { status: 400 });
  }
  if (!vrf_data) {
    return json({ code: 'invalid_body', message: 'Missing or invalid vrf_data' }, { status: 400 });
  }
  if (!webauthn_registration) {
    return json({ code: 'invalid_body', message: 'Missing or invalid webauthn_registration' }, { status: 400 });
  }

  const threshold = ctx.opts.threshold;
  const thresholdClientVerifyingShareB64u = isObject(threshold_ed25519)
    && typeof (threshold_ed25519 as Record<string, unknown>).client_verifying_share_b64u === 'string'
    ? String((threshold_ed25519 as Record<string, unknown>).client_verifying_share_b64u || '').trim()
    : '';
  let thresholdKeygen:
    | (Awaited<ReturnType<NonNullable<typeof threshold>['keygenFromClientVerifyingShareForRegistration']>> & { ok: true })
    | null = null;
  let thresholdWarning: string | null = null;

  if (thresholdClientVerifyingShareB64u) {
    if (!threshold) {
      thresholdWarning = 'threshold signing is not configured on this server';
    } else {
      const out = await threshold.keygenFromClientVerifyingShareForRegistration({
        clientVerifyingShareB64u: thresholdClientVerifyingShareB64u,
      });
      if (!out.ok) {
        thresholdWarning = out.message || 'threshold-ed25519 registration keygen failed';
      } else {
        thresholdKeygen = out;
      }
    }
  }

  const input = {
    new_account_id,
    new_public_key,
    vrf_data,
    webauthn_registration,
    deterministic_vrf_public_key,
    authenticator_options,
  } as unknown as CreateAccountAndRegisterRequest;

  const result = await ctx.service.createAccountAndRegisterUser(input);
  let response: CreateAccountAndRegisterResult = result;

  if (result.success && threshold && thresholdKeygen) {
    try {
      await threshold.putRelayerKeyMaterial({
        relayerKeyId: thresholdKeygen.relayerKeyId,
        publicKey: thresholdKeygen.publicKey,
        relayerSigningShareB64u: thresholdKeygen.relayerSigningShareB64u,
        relayerVerifyingShareB64u: thresholdKeygen.relayerVerifyingShareB64u,
      });
      response = {
        ...response,
        thresholdEd25519: {
          relayerKeyId: thresholdKeygen.relayerKeyId,
          publicKey: thresholdKeygen.publicKey,
          relayerVerifyingShareB64u: thresholdKeygen.relayerVerifyingShareB64u,
        },
      };
    } catch (e: unknown) {
      thresholdWarning = thresholdWarning || ((e && typeof e === 'object' && 'message' in e)
        ? String((e as { message?: unknown }).message || 'threshold signing persistence failed')
        : String(e || 'threshold signing persistence failed'));
    }
  }

  if (result.success && thresholdWarning) {
    response = {
      ...response,
      message: `${response.message || 'Account created and registered successfully'} (threshold enrollment skipped: ${thresholdWarning})`,
    };
  }

  return json(response, { status: response.success ? 200 : 400 });
}
