import {
  handleApplyServerLock,
  handleRemoveServerLock,
  handleGetShamirKeyInfo,
} from '../../../core/shamirHandlers';
import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { isObject, json, readJson, toResponse } from '../http';

export async function handleShamir(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method === 'POST' && ctx.pathname === '/vrf/apply-server-lock') {
    const shamir = ctx.service.shamirService;
    if (!shamir || !(await shamir.ensureReady())) {
      return json({ code: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
    }

    const body = await readJson(ctx.request);
    const valid = isObject(body) && typeof body.kek_c_b64u === 'string' && body.kek_c_b64u.length > 0;
    if (!valid) {
      return json({ code: 'invalid_body', message: 'kek_c_b64u is required' }, { status: 400 });
    }

    const out = await handleApplyServerLock(shamir, {
      body: { kek_c_b64u: String((body as Record<string, unknown>).kek_c_b64u) },
    });
    return toResponse(out);
  }

  if (ctx.method === 'POST' && ctx.pathname === '/vrf/remove-server-lock') {
    const shamir = ctx.service.shamirService;
    if (!shamir || !(await shamir.ensureReady())) {
      return json({ code: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
    }

    const body = await readJson(ctx.request);
    const valid = isObject(body)
      && typeof body.kek_cs_b64u === 'string' && body.kek_cs_b64u.length > 0
      && typeof (body as Record<string, unknown>).keyId === 'string'
      && String((body as Record<string, unknown>).keyId).length > 0;
    if (!valid) {
      return json({ code: 'invalid_body', message: 'kek_cs_b64u and keyId are required' }, { status: 400 });
    }

    const out = await handleRemoveServerLock(shamir, {
      body: {
        kek_cs_b64u: String((body as Record<string, unknown>).kek_cs_b64u),
        keyId: String((body as Record<string, unknown>).keyId),
      },
    });
    return toResponse(out);
  }

  if (ctx.method === 'GET' && ctx.pathname === '/shamir/key-info') {
    const shamir = ctx.service.shamirService;
    if (!shamir || !(await shamir.ensureReady())) {
      return json({ code: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
    }
    const out = await handleGetShamirKeyInfo(shamir);
    return toResponse(out);
  }

  return null;
}
