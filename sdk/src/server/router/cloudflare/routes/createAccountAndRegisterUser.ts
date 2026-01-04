import type { CreateAccountAndRegisterRequest } from '../../../core/types';
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

  const input = {
    new_account_id,
    new_public_key,
    vrf_data,
    webauthn_registration,
    deterministic_vrf_public_key,
    authenticator_options,
  } as unknown as CreateAccountAndRegisterRequest;

  const result = await ctx.service.createAccountAndRegisterUser(input);
  return json(result, { status: result.success ? 200 : 400 });
}
