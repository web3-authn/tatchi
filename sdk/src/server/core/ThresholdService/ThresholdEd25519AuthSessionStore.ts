import type { NormalizedLogger } from '../logger';
import type { ThresholdEd25519KeyStoreConfigInput } from '../types';
import { RedisTcpClient, UpstashRedisRestClient, redisGetJson, redisSetJson } from './kv';
import { toOptionalTrimmedString } from '../../../utils/validation';
import {
  isObject,
  toThresholdEd25519AuthPrefix,
  parseThresholdEd25519AuthSessionRecord,
} from './validation';

export type ThresholdEd25519AuthSessionRecord = {
  expiresAtMs: number;
  relayerKeyId: string;
  userId: string;
  rpId: string;
};

export type ThresholdEd25519AuthConsumeResult =
  | { ok: true; record: ThresholdEd25519AuthSessionRecord; remainingUses: number }
  | { ok: false; code: string; message: string };

export interface ThresholdEd25519AuthSessionStore {
  putSession(
    id: string,
    record: ThresholdEd25519AuthSessionRecord,
    opts: { ttlMs: number; remainingUses: number },
  ): Promise<void>;
  getSession(id: string): Promise<ThresholdEd25519AuthSessionRecord | null>;
  consumeUse(id: string): Promise<ThresholdEd25519AuthConsumeResult>;
}

class InMemoryThresholdEd25519AuthSessionStore implements ThresholdEd25519AuthSessionStore {
  private readonly keyPrefix: string;
  private readonly map = new Map<string, { record: ThresholdEd25519AuthSessionRecord; remainingUses: number; expiresAtMs: number }>();

  constructor(input: { keyPrefix?: string }) {
    this.keyPrefix = toThresholdEd25519AuthPrefix(input.keyPrefix);
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  async putSession(
    id: string,
    record: ThresholdEd25519AuthSessionRecord,
    opts: { ttlMs: number; remainingUses: number },
  ): Promise<void> {
    const key = this.key(id);
    const ttlMs = Math.max(0, Number(opts.ttlMs) || 0);
    const expiresAtMs = Date.now() + ttlMs;
    this.map.set(key, { record, remainingUses: Math.max(0, Number(opts.remainingUses) || 0), expiresAtMs });
  }

  async getSession(id: string): Promise<ThresholdEd25519AuthSessionRecord | null> {
    const key = this.key(id);
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAtMs) {
      this.map.delete(key);
      return null;
    }
    return entry.record;
  }

  async consumeUse(id: string): Promise<ThresholdEd25519AuthConsumeResult> {
    const key = this.key(id);
    const entry = this.map.get(key);
    if (!entry) return { ok: false, code: 'unauthorized', message: 'threshold session expired or invalid' };
    if (Date.now() > entry.expiresAtMs) {
      this.map.delete(key);
      return { ok: false, code: 'unauthorized', message: 'threshold session expired' };
    }
    if (entry.remainingUses <= 0) {
      return { ok: false, code: 'unauthorized', message: 'threshold session exhausted' };
    }
    entry.remainingUses -= 1;
    return { ok: true, record: entry.record, remainingUses: entry.remainingUses };
  }
}

class UpstashRedisRestThresholdEd25519AuthSessionStore implements ThresholdEd25519AuthSessionStore {
  private readonly client: UpstashRedisRestClient;
  private readonly keyPrefix: string;

  constructor(input: { url: string; token: string; keyPrefix?: string }) {
    const url = toOptionalTrimmedString(input.url);
    const token = toOptionalTrimmedString(input.token);
    if (!url) throw new Error('Upstash auth session store missing url');
    if (!token) throw new Error('Upstash auth session store missing token');
    this.client = new UpstashRedisRestClient({ url, token });
    this.keyPrefix = toThresholdEd25519AuthPrefix(input.keyPrefix);
  }

  private metaKey(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  private usesKey(id: string): string {
    return `${this.keyPrefix}${id}:uses`;
  }

  async putSession(
    id: string,
    record: ThresholdEd25519AuthSessionRecord,
    opts: { ttlMs: number; remainingUses: number },
  ): Promise<void> {
    const ttlMs = Math.max(0, Number(opts.ttlMs) || 0);
    await this.client.setJson(this.metaKey(id), record, ttlMs);
    await this.client.setRaw(this.usesKey(id), String(Math.max(0, Number(opts.remainingUses) || 0)), ttlMs);
  }

  async getSession(id: string): Promise<ThresholdEd25519AuthSessionRecord | null> {
    const raw = await this.client.getJson(this.metaKey(id));
    return parseThresholdEd25519AuthSessionRecord(raw);
  }

  async consumeUse(id: string): Promise<ThresholdEd25519AuthConsumeResult> {
    try {
      const remainingUses = await this.client.incrby(this.usesKey(id), -1);
      if (remainingUses < 0) {
        return { ok: false, code: 'unauthorized', message: 'threshold session exhausted' };
      }
      const record = await this.getSession(id);
      if (!record) {
        return { ok: false, code: 'unauthorized', message: 'threshold session expired or invalid' };
      }
      if (Date.now() > record.expiresAtMs) {
        return { ok: false, code: 'unauthorized', message: 'threshold session expired' };
      }
      return { ok: true, record, remainingUses };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Failed to consume threshold session');
      return { ok: false, code: 'internal', message: msg };
    }
  }
}

class RedisTcpThresholdEd25519AuthSessionStore implements ThresholdEd25519AuthSessionStore {
  private readonly client: RedisTcpClient;
  private readonly keyPrefix: string;

  constructor(input: { redisUrl: string; keyPrefix?: string }) {
    const url = toOptionalTrimmedString(input.redisUrl);
    if (!url) throw new Error('redis-tcp auth session store missing redisUrl');
    this.client = new RedisTcpClient(url);
    this.keyPrefix = toThresholdEd25519AuthPrefix(input.keyPrefix);
  }

  private metaKey(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  private usesKey(id: string): string {
    return `${this.keyPrefix}${id}:uses`;
  }

  async putSession(
    id: string,
    record: ThresholdEd25519AuthSessionRecord,
    opts: { ttlMs: number; remainingUses: number },
  ): Promise<void> {
    const ttlMs = Math.max(0, Number(opts.ttlMs) || 0);
    await redisSetJson(this.client, this.metaKey(id), record, ttlMs);
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    const uses = String(Math.max(0, Number(opts.remainingUses) || 0));
    const resp = await this.client.send(['SET', this.usesKey(id), uses, 'EX', String(ttlSeconds)]);
    if (resp.type === 'error') throw new Error(`Redis SET error: ${resp.value}`);
  }

  async getSession(id: string): Promise<ThresholdEd25519AuthSessionRecord | null> {
    const raw = await redisGetJson(this.client, this.metaKey(id));
    return parseThresholdEd25519AuthSessionRecord(raw);
  }

  async consumeUse(id: string): Promise<ThresholdEd25519AuthConsumeResult> {
    try {
      const resp = await this.client.send(['INCRBY', this.usesKey(id), '-1']);
      if (resp.type === 'error') return { ok: false, code: 'internal', message: `Redis INCRBY error: ${resp.value}` };
      const remainingUses = resp.type === 'integer' ? resp.value : Number(resp.value ?? 0);
      if (!Number.isFinite(remainingUses)) {
        return { ok: false, code: 'internal', message: 'Redis INCRBY returned non-integer value' };
      }
      if (remainingUses < 0) {
        return { ok: false, code: 'unauthorized', message: 'threshold session exhausted' };
      }
      const record = await this.getSession(id);
      if (!record) {
        return { ok: false, code: 'unauthorized', message: 'threshold session expired or invalid' };
      }
      if (Date.now() > record.expiresAtMs) {
        return { ok: false, code: 'unauthorized', message: 'threshold session expired' };
      }
      return { ok: true, record, remainingUses };
    } catch (e: unknown) {
      const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Failed to consume threshold session');
      return { ok: false, code: 'internal', message: msg };
    }
  }
}

export function createThresholdEd25519AuthSessionStore(input: {
  config?: ThresholdEd25519KeyStoreConfigInput | null;
  logger: NormalizedLogger;
  isNode: boolean;
}): ThresholdEd25519AuthSessionStore {
  const config = (isObject(input.config) ? input.config : {}) as Record<string, unknown>;
  const envPrefix = toOptionalTrimmedString(config.THRESHOLD_ED25519_AUTH_PREFIX);

  const kind = toOptionalTrimmedString(config.kind);
  if (kind === 'in-memory') return new InMemoryThresholdEd25519AuthSessionStore({ keyPrefix: envPrefix || undefined });
  if (kind === 'upstash-redis-rest') {
    return new UpstashRedisRestThresholdEd25519AuthSessionStore({
      url: toOptionalTrimmedString(config.url) || toOptionalTrimmedString(config.UPSTASH_REDIS_REST_URL),
      token: toOptionalTrimmedString(config.token) || toOptionalTrimmedString(config.UPSTASH_REDIS_REST_TOKEN),
      keyPrefix: toOptionalTrimmedString(config.keyPrefix) || envPrefix,
    });
  }
  if (kind === 'redis-tcp') {
    if (!input.isNode) {
      input.logger.warn('[threshold-ed25519] redis-tcp auth session store is not supported in this runtime; falling back to in-memory');
      return new InMemoryThresholdEd25519AuthSessionStore({ keyPrefix: envPrefix || undefined });
    }
    return new RedisTcpThresholdEd25519AuthSessionStore({
      redisUrl: toOptionalTrimmedString(config.redisUrl) || toOptionalTrimmedString(config.REDIS_URL),
      keyPrefix: toOptionalTrimmedString(config.keyPrefix) || envPrefix,
    });
  }

  const upstashUrl = toOptionalTrimmedString(config.UPSTASH_REDIS_REST_URL);
  const upstashToken = toOptionalTrimmedString(config.UPSTASH_REDIS_REST_TOKEN);
  if (upstashUrl || upstashToken) {
    if (!upstashUrl || !upstashToken) {
      throw new Error('Upstash auth session store enabled but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not both set');
    }
    input.logger.info('[threshold-ed25519] Using Upstash REST store for threshold auth sessions');
    return new UpstashRedisRestThresholdEd25519AuthSessionStore({ url: upstashUrl, token: upstashToken, keyPrefix: envPrefix || undefined });
  }

  const redisUrl = toOptionalTrimmedString(config.REDIS_URL);
  if (redisUrl) {
    if (!input.isNode) {
      input.logger.warn('[threshold-ed25519] REDIS_URL is set but TCP Redis is not supported in this runtime; falling back to in-memory');
      return new InMemoryThresholdEd25519AuthSessionStore({ keyPrefix: envPrefix || undefined });
    }
    input.logger.info('[threshold-ed25519] Using redis-tcp store for threshold auth sessions');
    return new RedisTcpThresholdEd25519AuthSessionStore({ redisUrl, keyPrefix: envPrefix || undefined });
  }

  input.logger.info('[threshold-ed25519] Using in-memory auth session store for threshold sessions (non-persistent)');
  return new InMemoryThresholdEd25519AuthSessionStore({ keyPrefix: envPrefix || undefined });
}
