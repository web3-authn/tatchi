import type { SignerMode, ThresholdBehavior } from '../types/signer-worker';
import { DEFAULT_THRESHOLD_BEHAVIOR, getThresholdBehaviorFromSignerMode } from '../types/signer-worker';
import { stripTrailingSlashes, toTrimmedString } from '../../utils/validation';

export type ThresholdEd25519HealthzResponse =
  | { ok: true; configured: true }
  | { ok: false; configured: false; code?: string; message?: string };

const DEFAULT_CACHE_TTL_MS = 60_000;
const cache = new Map<string, { configured: boolean; expiresAtMs: number }>();
const inFlight = new Map<string, Promise<boolean>>();
const DEFAULT_WARN_TTL_MS = 10 * 60_000;
const MAX_WARN_KEYS = 1_000;
const warnedUnsupportedRelayerByKey = new Map<string, number>();

export async function isRelayerThresholdEd25519Configured(
  relayerUrl: string,
  opts?: { cacheTtlMs?: number },
): Promise<boolean> {
  const base = stripTrailingSlashes(toTrimmedString(relayerUrl));
  return isRelayerThresholdEd25519ConfiguredBase(base, opts);
}

async function isRelayerThresholdEd25519ConfiguredBase(
  base: string,
  opts?: { cacheTtlMs?: number },
): Promise<boolean> {
  if (!base) return false;
  if (typeof fetch !== 'function') return false;

  const ttlMs = Math.max(0, Number(opts?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS));
  const now = Date.now();
  const cached = cache.get(base);
  if (cached && cached.expiresAtMs > now) return cached.configured;

  const existing = inFlight.get(base);
  if (existing) return existing;

  const req = (async (): Promise<boolean> => {
    try {
      const res = await fetch(`${base}/threshold-ed25519/healthz`, { method: 'GET' });
      if (!res.ok) {
        cache.set(base, { configured: false, expiresAtMs: now + ttlMs });
        return false;
      }
      const data = (await res.json().catch(() => null)) as ThresholdEd25519HealthzResponse | null;
      const configured = data?.configured === true;
      cache.set(base, { configured, expiresAtMs: now + ttlMs });
      return configured;
    } catch {
      cache.set(base, { configured: false, expiresAtMs: now + ttlMs });
      return false;
    } finally {
      inFlight.delete(base);
    }
  })();

  inFlight.set(base, req);
  return req;
}

function coerceThresholdBehavior(input?: ThresholdBehavior): ThresholdBehavior {
  return input === 'fallback' || input === 'strict' ? input : DEFAULT_THRESHOLD_BEHAVIOR;
}

function pruneWarned(nowMs: number): void {
  if (warnedUnsupportedRelayerByKey.size <= MAX_WARN_KEYS) return;
  for (const [key, expiresAtMs] of warnedUnsupportedRelayerByKey.entries()) {
    if (expiresAtMs <= nowMs) warnedUnsupportedRelayerByKey.delete(key);
  }
  while (warnedUnsupportedRelayerByKey.size > MAX_WARN_KEYS) {
    const first = warnedUnsupportedRelayerByKey.keys().next().value as string | undefined;
    if (!first) break;
    warnedUnsupportedRelayerByKey.delete(first);
  }
}

function warnOnce(key: string, message: string, opts?: { warnTtlMs?: number; warnings?: string[] }): void {
  const nowMs = Date.now();
  const ttlMs = Math.max(0, Math.floor(opts?.warnTtlMs ?? DEFAULT_WARN_TTL_MS));
  if (ttlMs === 0) return;
  pruneWarned(nowMs);
  const existing = warnedUnsupportedRelayerByKey.get(key);
  if (existing && existing > nowMs) return;
  warnedUnsupportedRelayerByKey.set(key, nowMs + ttlMs);
  // eslint-disable-next-line no-console
  console.warn(message);
  opts?.warnings?.push(message);
}

export async function fallbackToLocalSignerIfRelayerUnsupported(args: {
  nearAccountId: string;
  signerMode: SignerMode;
  relayerUrl: string;
  warnings?: string[];
  cacheTtlMs?: number;
  warnTtlMs?: number;
}): Promise<SignerMode['mode']> {
  const requested = args.signerMode.mode;
  if (requested !== 'threshold-signer') return requested;

  const base = stripTrailingSlashes(toTrimmedString(args.relayerUrl));
  const behavior = coerceThresholdBehavior(getThresholdBehaviorFromSignerMode(args.signerMode));
  const configured = await isRelayerThresholdEd25519ConfiguredBase(base, { cacheTtlMs: args.cacheTtlMs });
  if (configured) return requested;

  const msg = '[WebAuthnManager] signerMode=threshold-signer requested but the relayer does not support threshold signing';
  if (behavior === 'fallback') {
    warnOnce(`${args.nearAccountId}|${base}`, `${msg}; falling back to local-signer`, {
      warnTtlMs: args.warnTtlMs,
      warnings: args.warnings,
    });
    return 'local-signer';
  }
  throw new Error(`${msg}; set signerMode={ mode: 'threshold-signer', behavior: 'fallback' } to allow local-signer fallback`);
}

export async function resolveSignerModeForThresholdSigning(args: {
  nearAccountId: string;
  signerMode: SignerMode;
  relayerUrl: string;
  hasThresholdKeyMaterial: boolean;
  warnings?: string[];
  cacheTtlMs?: number;
  warnTtlMs?: number;
}): Promise<SignerMode['mode']> {
  const requested = args.signerMode.mode;
  if (requested !== 'threshold-signer') return requested;

  const behavior = coerceThresholdBehavior(getThresholdBehaviorFromSignerMode(args.signerMode));

  if (!args.hasThresholdKeyMaterial) {
    const msg = '[WebAuthnManager] signerMode=threshold-signer requested but threshold key material is unavailable';
    if (behavior === 'fallback') {
      warnOnce(`${args.nearAccountId}|threshold-key-material-missing`, `${msg}; falling back to local-signer`, {
        warnTtlMs: args.warnTtlMs,
        warnings: args.warnings,
      });
      return 'local-signer';
    }
    throw new Error(`${msg}; set signerMode={ mode: 'threshold-signer', behavior: 'fallback' } to allow local-signer fallback`);
  }

  return fallbackToLocalSignerIfRelayerUnsupported({
    nearAccountId: args.nearAccountId,
    signerMode: args.signerMode,
    relayerUrl: args.relayerUrl,
    warnings: args.warnings,
    cacheTtlMs: args.cacheTtlMs,
    warnTtlMs: args.warnTtlMs,
  });
}
