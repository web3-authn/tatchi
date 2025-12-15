import type {
  VRFWorkerMessage,
  WasmMintSessionKeysAndSendToSignerRequest,
} from '../../../types/vrf-worker';
import type { WebAuthnAuthenticationCredential, WebAuthnRegistrationCredential } from '../../../types/webauthn';
import type { VrfWorkerManagerHandlerContext } from './types';

/**
 * Mint/refresh a VRF-owned signing session and deliver WrapKey material to the signer worker.
 *
 * VRF WASM will:
 * - (optionally) gate on `verify_authentication_response` when `contractId` + `nearRpcUrl` are provided,
 * - derive WrapKeySeed from PRF.first_auth + the in-memory VRF secret key,
 * - choose/generate `wrapKeySalt` (when omitted/empty),
 * - upsert session metadata (TTL + remaining uses),
 * - and send `{ wrap_key_seed, wrapKeySalt, prfSecond? }` to the signer worker over the attached MessagePort.
 *
 * The main thread never receives WrapKeySeed; it only receives `wrapKeySalt` metadata.
 * This expects `createSigningSessionChannel` + signer port attachment to have happened for `sessionId`.
 */
export async function mintSessionKeysAndSendToSigner(
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
  const message: VRFWorkerMessage<WasmMintSessionKeysAndSendToSignerRequest> = {
    type: 'MINT_SESSION_KEYS_AND_SEND_TO_SIGNER',
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
  const response = await ctx.sendMessage<WasmMintSessionKeysAndSendToSignerRequest>(message);
  if (!response.success) {
    throw new Error(`mintSessionKeysAndSendToSigner failed: ${response.error}`);
  }
  // VRF WASM now delivers WrapKeySeed + wrapKeySalt directly to the signer worker via the
  // attached MessagePort; TS only needs to know that the session is prepared and
  // what wrapKeySalt was actually used (for new vault entries).
  const data = (response.data as unknown) as { sessionId: string; wrapKeySalt?: string } | undefined;
  const wrapKeySalt = data?.wrapKeySalt ?? args.wrapKeySalt ?? '';
  if (!wrapKeySalt) {
    throw new Error('mintSessionKeysAndSendToSigner: VRF worker did not return wrapKeySalt');
  }
  return { sessionId: data?.sessionId ?? args.sessionId, wrapKeySalt };
}
