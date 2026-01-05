import type { NormalizedLogger } from '../logger';
import type { ThresholdEd25519KeyStoreConfigInput } from '../types';
import { RedisTcpClient, UpstashRedisRestClient, redisGetdelJson, redisSetJson } from './kv';
import {
  normalizeOptionalString,
  normalizeThresholdEd25519SessionPrefix,
  parseThresholdEd25519MpcSessionRecord,
  parseThresholdEd25519SigningSessionRecord,
  isObject,
} from './validation';

export type ThresholdEd25519Commitments = { hiding: string; binding: string };

export type ThresholdEd25519MpcSessionRecord = {
  expiresAtMs: number;
  relayerKeyId: string;
  purpose: string;
  intentDigestB64u: string;
  signingDigestB64u: string;
  userId: string;
  rpId: string;
};

export type ThresholdEd25519SigningSessionRecord = {
  expiresAtMs: number;
  mpcSessionId: string;
  relayerKeyId: string;
  signingDigestB64u: string;
  clientCommitments: ThresholdEd25519Commitments;
  relayerCommitments: ThresholdEd25519Commitments;
  relayerNoncesB64u: string;
};

export interface ThresholdEd25519SessionStore {
  putMpcSession(id: string, record: ThresholdEd25519MpcSessionRecord, ttlMs: number): Promise<void>;
  takeMpcSession(id: string): Promise<ThresholdEd25519MpcSessionRecord | null>;
  putSigningSession(id: string, record: ThresholdEd25519SigningSessionRecord, ttlMs: number): Promise<void>;
  takeSigningSession(id: string): Promise<ThresholdEd25519SigningSessionRecord | null>;
}

class InMemoryThresholdEd25519SessionStore implements ThresholdEd25519SessionStore {
  private readonly map = new Map<string, { value: unknown; expiresAtMs: number }>();
  private readonly keyPrefix: string;

  constructor(input: { keyPrefix?: string }) {
    this.keyPrefix = normalizeThresholdEd25519SessionPrefix(input.keyPrefix);
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  private getRaw(key: string): unknown | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAtMs) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  async putMpcSession(id: string, record: ThresholdEd25519MpcSessionRecord, ttlMs: number): Promise<void> {
    const key = this.key(id);
    const expiresAtMs = Date.now() + Math.max(0, Number(ttlMs) || 0);
    this.map.set(key, { value: record, expiresAtMs });
  }

  async takeMpcSession(id: string): Promise<ThresholdEd25519MpcSessionRecord | null> {
    const key = this.key(id);
    const raw = this.getRaw(key);
    this.map.delete(key);
    return parseThresholdEd25519MpcSessionRecord(raw);
  }

  async putSigningSession(id: string, record: ThresholdEd25519SigningSessionRecord, ttlMs: number): Promise<void> {
    const key = this.key(id);
    const expiresAtMs = Date.now() + Math.max(0, Number(ttlMs) || 0);
    this.map.set(key, { value: record, expiresAtMs });
  }

  async takeSigningSession(id: string): Promise<ThresholdEd25519SigningSessionRecord | null> {
    const key = this.key(id);
    const raw = this.getRaw(key);
    this.map.delete(key);
    return parseThresholdEd25519SigningSessionRecord(raw);
  }
}

class UpstashRedisRestThresholdEd25519SessionStore implements ThresholdEd25519SessionStore {
  private readonly client: UpstashRedisRestClient;
  private readonly keyPrefix: string;

  constructor(input: { url: string; token: string; keyPrefix?: string }) {
    const url = normalizeOptionalString(input.url);
    const token = normalizeOptionalString(input.token);
    if (!url) throw new Error('Upstash session store missing url');
    if (!token) throw new Error('Upstash session store missing token');
    this.client = new UpstashRedisRestClient({ url, token });
    this.keyPrefix = normalizeThresholdEd25519SessionPrefix(input.keyPrefix);
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  async putMpcSession(id: string, record: ThresholdEd25519MpcSessionRecord, ttlMs: number): Promise<void> {
    const k = id;
    if (!k) throw new Error('Missing mpcSessionId');
    await this.client.setJson(this.key(k), record, ttlMs);
  }

  async takeMpcSession(id: string): Promise<ThresholdEd25519MpcSessionRecord | null> {
    const k = id;
    if (!k) return null;
    const raw = await this.client.getdelJson(this.key(k));
    return parseThresholdEd25519MpcSessionRecord(raw);
  }

  async putSigningSession(id: string, record: ThresholdEd25519SigningSessionRecord, ttlMs: number): Promise<void> {
    const k = id;
    if (!k) throw new Error('Missing signingSessionId');
    await this.client.setJson(this.key(k), record, ttlMs);
  }

  async takeSigningSession(id: string): Promise<ThresholdEd25519SigningSessionRecord | null> {
    const k = id;
    if (!k) return null;
    const raw = await this.client.getdelJson(this.key(k));
    return parseThresholdEd25519SigningSessionRecord(raw);
  }
}

class RedisTcpThresholdEd25519SessionStore implements ThresholdEd25519SessionStore {
  private readonly client: RedisTcpClient;
  private readonly keyPrefix: string;

  constructor(input: { redisUrl: string; keyPrefix?: string }) {
    const url = normalizeOptionalString(input.redisUrl);
    if (!url) throw new Error('redis-tcp session store missing redisUrl');
    this.client = new RedisTcpClient(url);
    this.keyPrefix = normalizeThresholdEd25519SessionPrefix(input.keyPrefix);
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  async putMpcSession(id: string, record: ThresholdEd25519MpcSessionRecord, ttlMs: number): Promise<void> {
    const k = id;
    if (!k) throw new Error('Missing mpcSessionId');
    await redisSetJson(this.client, this.key(k), record, ttlMs);
  }

  async takeMpcSession(id: string): Promise<ThresholdEd25519MpcSessionRecord | null> {
    const k = id;
    if (!k) return null;
    const raw = await redisGetdelJson(this.client, this.key(k));
    return parseThresholdEd25519MpcSessionRecord(raw);
  }

  async putSigningSession(id: string, record: ThresholdEd25519SigningSessionRecord, ttlMs: number): Promise<void> {
    const k = id;
    if (!k) throw new Error('Missing signingSessionId');
    await redisSetJson(this.client, this.key(k), record, ttlMs);
  }

  async takeSigningSession(id: string): Promise<ThresholdEd25519SigningSessionRecord | null> {
    const k = id;
    if (!k) return null;
    const raw = await redisGetdelJson(this.client, this.key(k));
    return parseThresholdEd25519SigningSessionRecord(raw);
  }
}

export function createThresholdEd25519SessionStore(input: {
  config?: ThresholdEd25519KeyStoreConfigInput | null;
  logger: NormalizedLogger;
  isNode: boolean;
}): ThresholdEd25519SessionStore {
  const config = (isObject(input.config) ? input.config : {}) as Record<string, unknown>;
  const envPrefix = normalizeOptionalString(config.THRESHOLD_ED25519_SESSION_PREFIX);

  // Explicit config object
  const kind = normalizeOptionalString(config.kind);
  if (kind === 'in-memory') return new InMemoryThresholdEd25519SessionStore({ keyPrefix: envPrefix || undefined });
  if (kind === 'upstash-redis-rest') {
    return new UpstashRedisRestThresholdEd25519SessionStore({
      url: normalizeOptionalString(config.url) || normalizeOptionalString(config.UPSTASH_REDIS_REST_URL),
      token: normalizeOptionalString(config.token) || normalizeOptionalString(config.UPSTASH_REDIS_REST_TOKEN),
      keyPrefix: normalizeOptionalString(config.keyPrefix) || envPrefix,
    });
  }
  if (kind === 'redis-tcp') {
    if (!input.isNode) {
      input.logger.warn('[threshold-ed25519] redis-tcp session store is not supported in this runtime; falling back to in-memory');
      return new InMemoryThresholdEd25519SessionStore({ keyPrefix: envPrefix || undefined });
    }
    return new RedisTcpThresholdEd25519SessionStore({
      redisUrl: normalizeOptionalString(config.redisUrl) || normalizeOptionalString(config.REDIS_URL),
      keyPrefix: normalizeOptionalString(config.keyPrefix) || envPrefix,
    });
  }

  // Env-shaped config: reuse UPSTASH/REDIS_URL detection like the key store.
  const upstashUrl = normalizeOptionalString(config.UPSTASH_REDIS_REST_URL);
  const upstashToken = normalizeOptionalString(config.UPSTASH_REDIS_REST_TOKEN);
  if (upstashUrl || upstashToken) {
    if (!upstashUrl || !upstashToken) {
      throw new Error('Upstash session store enabled but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not both set');
    }
    input.logger.info('[threshold-ed25519] Using Upstash REST session store for signing session persistence');
    return new UpstashRedisRestThresholdEd25519SessionStore({ url: upstashUrl, token: upstashToken, keyPrefix: envPrefix || undefined });
  }

  const redisUrl = normalizeOptionalString(config.REDIS_URL);
  if (redisUrl) {
    if (!input.isNode) {
      input.logger.warn('[threshold-ed25519] REDIS_URL is set but TCP Redis is not supported in this runtime; falling back to in-memory');
      return new InMemoryThresholdEd25519SessionStore({ keyPrefix: envPrefix || undefined });
    }
    input.logger.info('[threshold-ed25519] Using redis-tcp session store for signing session persistence');
    return new RedisTcpThresholdEd25519SessionStore({ redisUrl, keyPrefix: envPrefix || undefined });
  }

  input.logger.info('[threshold-ed25519] Using in-memory session store for threshold signing sessions (non-persistent)');
  return new InMemoryThresholdEd25519SessionStore({ keyPrefix: envPrefix || undefined });
}
