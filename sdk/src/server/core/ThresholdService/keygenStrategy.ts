import { ensureEd25519Prefix, toOptionalTrimmedString } from '../../../utils/validation';
import {
  threshold_ed25519_keygen_from_client_verifying_share,
  threshold_ed25519_keygen_from_master_secret_and_client_verifying_share,
} from '../../../wasm_signer_worker/pkg/wasm_signer_worker.js';

export type ThresholdEd25519KeygenMaterial = {
  relayerKeyId: string;
  publicKey: string;
  relayerSigningShareB64u: string;
  relayerVerifyingShareB64u: string;
};

export interface ThresholdEd25519KeygenStrategy {
  usesDerivedRelayerShares(): boolean;

  keygenFromClientVerifyingShare(input: {
    nearAccountId: string;
    rpId?: string | null;
    clientVerifyingShareB64u: string;
  }): Promise<
    | { ok: true; keyMaterial: ThresholdEd25519KeygenMaterial }
    | { ok: false; code: string; message: string }
  >;

  deriveRelayerKeyMaterial(input: {
    nearAccountId: string;
    rpId: string;
    clientVerifyingShareB64u: string;
    expectedRelayerKeyId: string;
  }): Promise<
    | { ok: true; publicKey: string; relayerSigningShareB64u: string; relayerVerifyingShareB64u: string }
    | { ok: false; code: string; message: string }
  >;
}

type ThresholdEd25519KeygenWasmOutput = {
  relayerKeyId?: string;
  publicKey: string;
  relayerSigningShareB64u: string;
  relayerVerifyingShareB64u: string;
};

function expectThresholdEd25519KeygenWasmOutput(out: unknown): ThresholdEd25519KeygenWasmOutput {
  const parsed = out as ThresholdEd25519KeygenWasmOutput;
  if (!parsed?.relayerSigningShareB64u || !parsed?.relayerVerifyingShareB64u || !parsed?.publicKey) {
    throw new Error('threshold-ed25519 keygen returned incomplete output');
  }
  return parsed;
}

export class ThresholdEd25519KeygenStrategyV1 implements ThresholdEd25519KeygenStrategy {
  private readonly useDerivedShares: boolean;
  private readonly relayerMasterSecretB64u: string | null;
  private readonly clientParticipantId: number;
  private readonly relayerParticipantId: number;
  private readonly ensureSignerWasm: () => Promise<void>;

  constructor(input: {
    useDerivedShares: boolean;
    relayerMasterSecretB64u: string | null;
    clientParticipantId: number;
    relayerParticipantId: number;
    ensureSignerWasm: () => Promise<void>;
  }) {
    this.useDerivedShares = input.useDerivedShares;
    this.relayerMasterSecretB64u = input.relayerMasterSecretB64u;
    this.clientParticipantId = input.clientParticipantId;
    this.relayerParticipantId = input.relayerParticipantId;
    this.ensureSignerWasm = input.ensureSignerWasm;
  }

  usesDerivedRelayerShares(): boolean {
    return this.useDerivedShares;
  }

  async keygenFromClientVerifyingShare(input: {
    nearAccountId: string;
    rpId?: string | null;
    clientVerifyingShareB64u: string;
  }): Promise<
    | { ok: true; keyMaterial: ThresholdEd25519KeygenMaterial }
    | { ok: false; code: string; message: string }
  > {
    const nearAccountId = toOptionalTrimmedString(input.nearAccountId);
    if (!nearAccountId) return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
    const rpId = toOptionalTrimmedString(input.rpId);
    const clientVerifyingShareB64u = toOptionalTrimmedString(input.clientVerifyingShareB64u);
    if (!clientVerifyingShareB64u) return { ok: false, code: 'invalid_body', message: 'clientVerifyingShareB64u is required' };

    await this.ensureSignerWasm();

    let out: ThresholdEd25519KeygenWasmOutput;
    if (this.useDerivedShares) {
      if (!rpId) return { ok: false, code: 'invalid_body', message: 'rpId is required' };
      const masterSecretB64u = toOptionalTrimmedString(this.relayerMasterSecretB64u);
      if (!masterSecretB64u) {
        return {
          ok: false,
          code: 'missing_config',
          message: 'Missing THRESHOLD_ED25519_MASTER_SECRET_B64U for derived share mode',
        };
      }

      out = expectThresholdEd25519KeygenWasmOutput(
        threshold_ed25519_keygen_from_master_secret_and_client_verifying_share({
          masterSecretB64u,
          nearAccountId,
          rpId,
          clientVerifyingShareB64u,
          clientParticipantId: this.clientParticipantId,
          relayerParticipantId: this.relayerParticipantId,
        }),
      );
    } else {
      out = expectThresholdEd25519KeygenWasmOutput(
        threshold_ed25519_keygen_from_client_verifying_share({
          clientVerifyingShareB64u,
          clientParticipantId: this.clientParticipantId,
          relayerParticipantId: this.relayerParticipantId,
        } as any),
      );
    }

    const publicKey = ensureEd25519Prefix(out.publicKey);
    const relayerKeyId = toOptionalTrimmedString(out.relayerKeyId) || publicKey; // default: relayerKeyId := publicKey

    return {
      ok: true,
      keyMaterial: {
        relayerKeyId,
        publicKey,
        relayerSigningShareB64u: out.relayerSigningShareB64u,
        relayerVerifyingShareB64u: out.relayerVerifyingShareB64u,
      },
    };
  }

  async deriveRelayerKeyMaterial(input: {
    nearAccountId: string;
    rpId: string;
    clientVerifyingShareB64u: string;
    expectedRelayerKeyId: string;
  }): Promise<
    | { ok: true; publicKey: string; relayerSigningShareB64u: string; relayerVerifyingShareB64u: string }
    | { ok: false; code: string; message: string }
  > {
    if (!this.useDerivedShares) {
      return { ok: false, code: 'missing_config', message: 'Derived relayer shares are not enabled' };
    }

    const expectedRelayerKeyId = toOptionalTrimmedString(input.expectedRelayerKeyId);
    if (!expectedRelayerKeyId) {
      return { ok: false, code: 'invalid_body', message: 'relayerKeyId is required' };
    }

    const out = await this.keygenFromClientVerifyingShare({
      nearAccountId: input.nearAccountId,
      rpId: input.rpId,
      clientVerifyingShareB64u: input.clientVerifyingShareB64u,
    });
    if (!out.ok) return out;

    const publicKey = out.keyMaterial.publicKey;
    if (publicKey !== expectedRelayerKeyId) {
      return {
        ok: false,
        code: 'group_pk_mismatch',
        message: 'clientVerifyingShareB64u does not match relayerKeyId',
      };
    }

    return {
      ok: true,
      publicKey,
      relayerSigningShareB64u: out.keyMaterial.relayerSigningShareB64u,
      relayerVerifyingShareB64u: out.keyMaterial.relayerVerifyingShareB64u,
    };
  }
}
