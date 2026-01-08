import type { DelegateActionPolicy } from '../delegateAction';
import type { RouterLogger } from './logger';
import type {
  ThresholdEd25519AuthorizeWithSessionRequest,
  ThresholdEd25519AuthorizeRequest,
  ThresholdEd25519AuthorizeResponse,
  ThresholdEd25519KeygenRequest,
  ThresholdEd25519KeygenResponse,
  ThresholdEd25519PeerSignFinalizeRequest,
  ThresholdEd25519PeerSignFinalizeResponse,
  ThresholdEd25519SessionRequest,
  ThresholdEd25519SessionResponse,
  ThresholdEd25519SignFinalizeRequest,
  ThresholdEd25519SignFinalizeResponse,
  ThresholdEd25519SignInitRequest,
  ThresholdEd25519SignInitResponse,
  ThresholdEd25519PeerSignInitRequest,
  ThresholdEd25519PeerSignInitResponse,
} from '../core/types';

// Minimal session adapter interface expected by the routers.
export type SessionClaims = Record<string, unknown>;

export type SessionKind = 'cookie' | 'jwt';

export function parseSessionKind(body: unknown): SessionKind {
  const v = (body && typeof body === 'object' && !Array.isArray(body))
    ? (body as Record<string, unknown>)
    : {};
  const raw = v.sessionKind ?? v.session_kind;
  return raw === 'cookie' ? 'cookie' : 'jwt';
}

export interface SessionAdapter {
  signJwt(sub: string, extra?: Record<string, unknown>): Promise<string>;
  parse(headers: Record<string, string | string[] | undefined>): Promise<{ ok: true; claims: SessionClaims } | { ok: false }>;
  buildSetCookie(token: string): string;
  buildClearCookie(): string;
  refresh(headers: Record<string, string | string[] | undefined>): Promise<{ ok: boolean; jwt?: string; code?: string; message?: string }>;
}

export type ThresholdEd25519RegistrationKeygenResult =
  | {
      ok: true;
      clientParticipantId: number;
      relayerParticipantId: number;
      participantIds: number[];
      relayerKeyId: string;
      publicKey: string;
      relayerSigningShareB64u: string;
      relayerVerifyingShareB64u: string;
    }
  | { ok: false; code: string; message: string };

export interface ThresholdSigningAdapter {
  keygenFromClientVerifyingShareForRegistration(input: {
    nearAccountId: string;
    rpId: string;
    clientVerifyingShareB64u: string;
  }): Promise<ThresholdEd25519RegistrationKeygenResult>;
  putRelayerKeyMaterial(input: {
    relayerKeyId: string;
    publicKey: string;
    relayerSigningShareB64u: string;
    relayerVerifyingShareB64u: string;
  }): Promise<void>;
  thresholdEd25519Keygen(request: ThresholdEd25519KeygenRequest): Promise<ThresholdEd25519KeygenResponse>;
  authorizeThresholdEd25519(request: ThresholdEd25519AuthorizeRequest): Promise<ThresholdEd25519AuthorizeResponse>;
  authorizeThresholdEd25519WithSession(input: {
    sessionId: string;
    userId: string;
    request: ThresholdEd25519AuthorizeWithSessionRequest;
  }): Promise<ThresholdEd25519AuthorizeResponse>;
  thresholdEd25519Session(request: ThresholdEd25519SessionRequest): Promise<ThresholdEd25519SessionResponse>;
  thresholdEd25519SignInit(request: ThresholdEd25519SignInitRequest): Promise<ThresholdEd25519SignInitResponse>;
  thresholdEd25519SignFinalize(request: ThresholdEd25519SignFinalizeRequest): Promise<ThresholdEd25519SignFinalizeResponse>;
  /**
   * Internal coordinator→peer signing API (optional).
   * When omitted, coordinator fanout mode is unsupported.
   */
  thresholdEd25519PeerSignInit?: (request: ThresholdEd25519PeerSignInitRequest) => Promise<ThresholdEd25519PeerSignInitResponse>;
  thresholdEd25519PeerSignFinalize?: (request: ThresholdEd25519PeerSignFinalizeRequest) => Promise<ThresholdEd25519PeerSignFinalizeResponse>;
}

export interface RelayRouterOptions {
  healthz?: boolean;
  readyz?: boolean;
  /**
   * Optional list(s) of CORS origins (CSV strings or literal origins).
   * Pass raw strings; the router normalizes/merges internally.
   */
  corsOrigins?: Array<string | undefined>;
  /**
   * Optional route for submitting NEP-461 SignedDelegate meta-transactions.
   * - When omitted: disabled.
   * - When set: enabled at `route`.
   * `policy` is server-controlled and is never read from the request body.
   */
  signedDelegate?: {
    route: string;
    policy?: DelegateActionPolicy;
  };
  // Optional: customize session route paths
  sessionRoutes?: { auth?: string; logout?: string };
  // Optional: pluggable session adapter
  session?: SessionAdapter | null;
  // Optional: pluggable threshold signing service
  threshold?: ThresholdSigningAdapter | null;
  // Optional logger; defaults to silent.
  logger?: RouterLogger | null;
}
