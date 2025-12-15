import type {
  VRFWorkerMessage,
  WasmDeriveWrapKeySeedAndSessionRequest,
} from '../../../types/vrf-worker';
import type { WebAuthnAuthenticationCredential, WebAuthnRegistrationCredential } from '../../../types/webauthn';
import type { VrfWorkerManagerHandlerContext } from './types';

export async function deriveWrapKeySeedAndSendToSigner(
  ctx: VrfWorkerManagerHandlerContext,
  args: {
    sessionId: string;
    prfFirstAuthB64u: string;
    wrapKeySalt?: string;
    contractId?: string;
    nearRpcUrl?: string;
    ttlMs?: number;
    remainingUses?: number;
    credential?: WebAuthnRegistrationCredential | WebAuthnAuthenticationCredential;
  }
): Promise<{ sessionId: string; wrapKeySalt: string }> {
  await ctx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<WasmDeriveWrapKeySeedAndSessionRequest> = {
    type: 'DERIVE_WRAP_KEY_SEED_AND_SESSION',
    id: ctx.generateMessageId(),
    payload: {
      sessionId: args.sessionId,
      prfFirstAuthB64u: args.prfFirstAuthB64u,
      // Use empty string as a sentinel to tell the VRF worker to generate wrapKeySalt when none is provided.
      wrapKeySalt: args.wrapKeySalt ?? '',
      contractId: args.contractId,
      nearRpcUrl: args.nearRpcUrl,
      ttlMs: args.ttlMs,
      remainingUses: args.remainingUses,
      credential: args.credential,
    }
  };
  const response = await ctx.sendMessage<WasmDeriveWrapKeySeedAndSessionRequest>(message);
  if (!response.success) {
    throw new Error(`deriveWrapKeySeedAndSendToSigner failed: ${response.error}`);
  }
  // VRF WASM now delivers WrapKeySeed + wrapKeySalt directly to the signer worker via the
  // attached MessagePort; TS only needs to know that the session is prepared and
  // what wrapKeySalt was actually used (for new vault entries).
  const data = (response.data as unknown) as { sessionId: string; wrapKeySalt?: string } | undefined;
  const wrapKeySalt = data?.wrapKeySalt ?? args.wrapKeySalt ?? '';
  if (!wrapKeySalt) {
    throw new Error('deriveWrapKeySeedAndSendToSigner: VRF worker did not return wrapKeySalt');
  }
  return { sessionId: data?.sessionId ?? args.sessionId, wrapKeySalt };
}

