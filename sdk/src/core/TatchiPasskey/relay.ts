import type { SignedDelegate } from '../types/delegate';

export interface RelayDelegateRequest {
  hash: string;
  signedDelegate: SignedDelegate;
}

export interface RelayDelegateResponse {
  ok: boolean;
  relayerTxHash?: string;
  status?: string;
  outcome?: unknown;
  error?: string;
}

export async function sendDelegateActionViaRelayer(args: {
  url: string;
  payload: RelayDelegateRequest;
  signal?: AbortSignal;
}): Promise<RelayDelegateResponse> {
  const { url, payload, signal } = args;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    return {
      ok: false,
      error: `Relayer HTTP ${res.status}`,
    };
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      error: 'Relayer returned non-JSON response',
    };
  }

  return {
    ok: Boolean(json?.ok ?? true),
    relayerTxHash: json?.relayerTxHash ?? json?.transactionId ?? json?.txHash,
    status: json?.status,
    outcome: json?.outcome,
    error: json?.error,
  };
}

