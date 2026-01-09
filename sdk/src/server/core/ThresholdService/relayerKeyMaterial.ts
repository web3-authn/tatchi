import { toOptionalTrimmedString } from '../../../utils/validation';
import type { ThresholdEd25519KeyStore } from './stores/KeyStore';
import type { ThresholdEd25519KeygenStrategy } from './keygenStrategy';
import type { ThresholdEd25519ShareMode } from './config';

export function shouldUseDerivedRelayerShares(input: {
  shareMode: ThresholdEd25519ShareMode;
  relayerMasterSecretB64u: string | null;
}): boolean {
  if (input.shareMode === 'derived') return true;
  if (input.shareMode === 'kv') return false;
  return Boolean(input.relayerMasterSecretB64u);
}

export async function resolveThresholdEd25519RelayerKeyMaterial(input: {
  relayerKeyId: string;
  nearAccountId: string;
  rpId: string;
  clientVerifyingShareB64u: string;
  shareMode: ThresholdEd25519ShareMode;
  relayerMasterSecretB64u: string | null;
  keyStore: ThresholdEd25519KeyStore;
  keygenStrategy: ThresholdEd25519KeygenStrategy;
}): Promise<
  | { ok: true; publicKey: string; relayerSigningShareB64u: string; relayerVerifyingShareB64u: string }
  | { ok: false; code: string; message: string }
> {
  const relayerKeyId = toOptionalTrimmedString(input.relayerKeyId);
  if (!relayerKeyId) return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };

  if (input.shareMode !== 'derived') {
    const existing = await input.keyStore.get(relayerKeyId);
    if (existing) return { ok: true, ...existing };
    if (input.shareMode === 'kv') {
      return { ok: false, code: 'missing_key', message: 'Unknown relayerKeyId; call /threshold-ed25519/keygen first' };
    }
  }

  const useDerived = shouldUseDerivedRelayerShares({
    shareMode: input.shareMode,
    relayerMasterSecretB64u: input.relayerMasterSecretB64u,
  });
  if (!useDerived) {
    return { ok: false, code: 'missing_key', message: 'Unknown relayerKeyId; call /threshold-ed25519/keygen first' };
  }

  const clientVerifyingShareB64u = toOptionalTrimmedString(input.clientVerifyingShareB64u);
  if (!clientVerifyingShareB64u) {
    return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };
  }
  const nearAccountId = toOptionalTrimmedString(input.nearAccountId);
  if (!nearAccountId) return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
  const rpId = toOptionalTrimmedString(input.rpId);
  if (!rpId) return { ok: false, code: 'invalid_body', message: 'rpId is required' };

  return input.keygenStrategy.deriveRelayerKeyMaterial({
    nearAccountId,
    rpId,
    clientVerifyingShareB64u,
    expectedRelayerKeyId: relayerKeyId,
  });
}
