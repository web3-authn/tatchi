import type { SignerWorkerManagerContext } from '..';
import {
  WorkerRequestType,
  WorkerResponseType,
  type WasmDeriveThresholdEd25519ClientVerifyingShareResult,
} from '../../../types/signer-worker';

export async function deriveThresholdEd25519ClientVerifyingShare(args: {
  ctx: SignerWorkerManagerContext;
  sessionId: string;
  nearAccountId: string;
}): Promise<{
  success: boolean;
  nearAccountId: string;
  clientVerifyingShareB64u: string;
  wrapKeySalt: string;
  error?: string;
}> {
  const { ctx } = args;
  const sessionId = args.sessionId;
  const nearAccountId = args.nearAccountId;

  try {
    if (!sessionId) throw new Error('Missing sessionId');
    if (!nearAccountId) throw new Error('Missing nearAccountId');

    const response = await ctx.sendMessage<WorkerRequestType.DeriveThresholdEd25519ClientVerifyingShare>({
      sessionId,
      message: {
        type: WorkerRequestType.DeriveThresholdEd25519ClientVerifyingShare,
        payload: { nearAccountId },
      },
    });

    if (response.type !== WorkerResponseType.DeriveThresholdEd25519ClientVerifyingShareSuccess) {
      throw new Error('DeriveThresholdEd25519ClientVerifyingShare failed');
    }

    const wasmResult = response.payload as WasmDeriveThresholdEd25519ClientVerifyingShareResult;
    const clientVerifyingShareB64u = wasmResult?.clientVerifyingShareB64u;
    const wrapKeySalt = wasmResult?.wrapKeySalt;

    if (!clientVerifyingShareB64u) throw new Error('Missing clientVerifyingShareB64u in worker response');
    if (!wrapKeySalt) throw new Error('Missing wrapKeySalt in worker response');

    return {
      success: true,
      nearAccountId,
      clientVerifyingShareB64u,
      wrapKeySalt
    };
  } catch (error: unknown) {
    const message = String((error as { message?: unknown })?.message ?? error);
    return {
      success: false,
      nearAccountId,
      clientVerifyingShareB64u: '',
      wrapKeySalt: '',
      error: message
    };
  }
}
