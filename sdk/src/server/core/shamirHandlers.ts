import type {
  ShamirApplyServerLockRequest,
  ShamirApplyServerLockResponse,
  ShamirRemoveServerLockRequest,
  ShamirRemoveServerLockResponse,
} from './types';
import type { ShamirService } from './ShamirService';
import { isString } from '@/utils/validation';

export async function handleApplyServerLock(
  service: ShamirService,
  request: { body?: { kek_c_b64u?: string } },
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  try {
    const kek_c_b64u = request.body?.kek_c_b64u;
    if (!isString(kek_c_b64u) || !kek_c_b64u) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'kek_c_b64u required and must be a non-empty string' }),
      };
    }

    const out: ShamirApplyServerLockResponse = await service.applyServerLock(kek_c_b64u);
    const keyId = service.getCurrentShamirKeyId();

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...out, keyId }),
    };
  } catch (e: any) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', details: e?.message }),
    };
  }
}

export async function handleRemoveServerLock(
  service: ShamirService,
  request: { body?: { kek_cs_b64u?: string; keyId?: string } },
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  try {
    const body = request.body;
    if (!body) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing body' }),
      };
    }
    const { kek_cs_b64u, keyId } = body;
    if (!isString(kek_cs_b64u) || !kek_cs_b64u) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'kek_cs_b64u required and must be a non-empty string' }),
      };
    }
    if (!isString(keyId) || !keyId) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'keyId required and must be a non-empty string' }),
      };
    }

    const providedKeyId = String(keyId);
    const currentKeyId = service.getCurrentShamirKeyId();
    let out: ShamirRemoveServerLockResponse;

    if (currentKeyId && providedKeyId === currentKeyId) {
      out = await service.removeServerLock(kek_cs_b64u);
    } else if (service.hasGraceKey(providedKeyId)) {
      out = await service.removeGraceServerLockWithKey(providedKeyId, { kek_cs_b64u } as ShamirRemoveServerLockRequest);
    } else {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'unknown keyId' }),
      };
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out),
    };
  } catch (e: any) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', details: e?.message }),
    };
  }
}

export async function handleGetShamirKeyInfo(
  service: ShamirService,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  try {
    await service.ensureReady();
    const currentKeyId = service.getCurrentShamirKeyId();
    const graceKeyIds = service.getGraceKeyIds();

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentKeyId,
        p_b64u: service.getShamirConfig()?.shamir_p_b64u ?? null,
        graceKeyIds,
      }),
    };
  } catch (e: any) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', details: e?.message }),
    };
  }
}

export async function handleListGraceKeys(
  service: ShamirService,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  try {
    await service.ensureGraceKeysLoaded();
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graceKeyIds: service.getGraceKeyIds() }),
    };
  } catch (e: any) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', details: e?.message }),
    };
  }
}

export async function handleAddGraceKey(
  service: ShamirService,
  request: { e_s_b64u?: string; d_s_b64u?: string },
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  try {
    const { e_s_b64u, d_s_b64u } = request || ({} as any);
    if (!isString(e_s_b64u) || !e_s_b64u || !isString(d_s_b64u) || !d_s_b64u) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'e_s_b64u and d_s_b64u required' }),
      };
    }

    await service.ensureGraceKeysLoaded();
    const added = await service.addGraceKeyInternal({ e_s_b64u, d_s_b64u }, { persist: true, skipIfExists: true });
    if (!added) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'failed to add grace key' }),
      };
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId: added.keyId }),
    };
  } catch (e: any) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', details: e?.message }),
    };
  }
}

export async function handleRemoveGraceKey(
  service: ShamirService,
  request: { keyId?: string },
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  try {
    const keyId = request?.keyId;
    if (!isString(keyId) || !keyId) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'keyId required and must be a non-empty string' }),
      };
    }

    const removed = await service.removeGraceKeyInternal(keyId, { persist: true });
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removed }),
    };
  } catch (e: any) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', details: e?.message }),
    };
  }
}
