import type { NormalizedLogger } from '../logger';
import type { ThresholdEd25519KeyStoreConfigInput } from '../types';
import { RedisTcpClient, UpstashRedisRestClient, redisDel, redisGetJson, redisSetJson } from './kv';
import { toOptionalTrimmedString } from '../../../utils/validation';
import {
  isObject,
  toThresholdEd25519KeyPrefix,
  parseThresholdEd25519KeyRecord,
} from './validation';

export type ThresholdEd25519KeyRecord = {
  publicKey: string;
  relayerSigningShareB64u: string;
  relayerVerifyingShareB64u: string;
};

export interface ThresholdEd25519KeyStore {
  get(relayerKeyId: string): Promise<ThresholdEd25519KeyRecord | null>;
  put(relayerKeyId: string, record: ThresholdEd25519KeyRecord): Promise<void>;
  del(relayerKeyId: string): Promise<void>;
}

class InMemoryThresholdEd25519KeyStore implements ThresholdEd25519KeyStore {
  private readonly map = new Map<string, ThresholdEd25519KeyRecord>();

  async get(relayerKeyId: string): Promise<ThresholdEd25519KeyRecord | null> {
    const id = relayerKeyId;
    if (!id) return null;
    return this.map.get(id) || null;
  }

  async put(relayerKeyId: string, record: ThresholdEd25519KeyRecord): Promise<void> {
    const id = relayerKeyId;
    if (!id) throw new Error('Missing relayerKeyId');
    this.map.set(id, record);
  }

  async del(relayerKeyId: string): Promise<void> {
    const id = relayerKeyId;
    if (!id) return;
    this.map.delete(id);
  }
}

class UpstashRedisRestThresholdEd25519KeyStore implements ThresholdEd25519KeyStore {
  private readonly client: UpstashRedisRestClient;
  private readonly keyPrefix: string;

  constructor(input: { url: string; token: string; keyPrefix?: string }) {
    const url = toOptionalTrimmedString(input.url);
    const token = toOptionalTrimmedString(input.token);
    if (!url) throw new Error('Upstash key store missing url');
    if (!token) throw new Error('Upstash key store missing token');
    this.client = new UpstashRedisRestClient({ url, token });
    this.keyPrefix = toThresholdEd25519KeyPrefix(input.keyPrefix);
  }

  private key(relayerKeyId: string): string {
    return `${this.keyPrefix}${relayerKeyId}`;
  }

  async get(relayerKeyId: string): Promise<ThresholdEd25519KeyRecord | null> {
    const id = relayerKeyId;
    if (!id) return null;
    const raw = await this.client.getJson(this.key(id));
    return parseThresholdEd25519KeyRecord(raw);
  }

  async put(relayerKeyId: string, record: ThresholdEd25519KeyRecord): Promise<void> {
    const id = relayerKeyId;
    if (!id) throw new Error('Missing relayerKeyId');
    await this.client.setJson(this.key(id), record);
  }

  async del(relayerKeyId: string): Promise<void> {
    const id = relayerKeyId;
    if (!id) return;
    await this.client.del(this.key(id));
  }
}

class RedisTcpThresholdEd25519KeyStore implements ThresholdEd25519KeyStore {
  private readonly keyPrefix: string;
  private readonly client: RedisTcpClient;

  constructor(input: { redisUrl: string; keyPrefix?: string }) {
    const url = toOptionalTrimmedString(input.redisUrl);
    if (!url) throw new Error('redis-tcp key store missing redisUrl');
    this.client = new RedisTcpClient(url);
    this.keyPrefix = toThresholdEd25519KeyPrefix(input.keyPrefix);
  }

  private key(relayerKeyId: string): string {
    return `${this.keyPrefix}${relayerKeyId}`;
  }

  async get(relayerKeyId: string): Promise<ThresholdEd25519KeyRecord | null> {
    const id = relayerKeyId;
    if (!id) return null;
    const raw = await redisGetJson(this.client, this.key(id));
    return parseThresholdEd25519KeyRecord(raw);
  }

  async put(relayerKeyId: string, record: ThresholdEd25519KeyRecord): Promise<void> {
    const id = relayerKeyId;
    if (!id) throw new Error('Missing relayerKeyId');
    await redisSetJson(this.client, this.key(id), record);
  }

  async del(relayerKeyId: string): Promise<void> {
    const id = relayerKeyId;
    if (!id) return;
    await redisDel(this.client, this.key(id));
  }
}

export function createThresholdEd25519KeyStore(input: {
  config?: ThresholdEd25519KeyStoreConfigInput | null;
  logger: NormalizedLogger;
  isNode: boolean;
}): ThresholdEd25519KeyStore {
  const config = (isObject(input.config) ? input.config : {}) as Record<string, unknown>;
  const envPrefix = toOptionalTrimmedString(config.THRESHOLD_ED25519_KEYSTORE_PREFIX);

  // Explicit config object
  const kind = toOptionalTrimmedString(config.kind);
  if (kind === 'in-memory') return new InMemoryThresholdEd25519KeyStore();
  if (kind === 'upstash-redis-rest') {
    return new UpstashRedisRestThresholdEd25519KeyStore({
      url: toOptionalTrimmedString(config.url) || toOptionalTrimmedString(config.UPSTASH_REDIS_REST_URL),
      token: toOptionalTrimmedString(config.token) || toOptionalTrimmedString(config.UPSTASH_REDIS_REST_TOKEN),
      keyPrefix: toOptionalTrimmedString(config.keyPrefix) || envPrefix,
    });
  }
  if (kind === 'redis-tcp') {
    if (!input.isNode) {
      input.logger.warn('[threshold-ed25519] redis-tcp key store is not supported in this runtime; falling back to in-memory');
      return new InMemoryThresholdEd25519KeyStore();
    }
    return new RedisTcpThresholdEd25519KeyStore({
      redisUrl: toOptionalTrimmedString(config.redisUrl) || toOptionalTrimmedString(config.REDIS_URL),
      keyPrefix: toOptionalTrimmedString(config.keyPrefix) || envPrefix,
    });
  }

  // Env-shaped config
  const upstashUrl = toOptionalTrimmedString(config.UPSTASH_REDIS_REST_URL);
  const upstashToken = toOptionalTrimmedString(config.UPSTASH_REDIS_REST_TOKEN);
  if (upstashUrl || upstashToken) {
    if (!upstashUrl || !upstashToken) {
      throw new Error('Upstash key store enabled but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not both set');
    }
    input.logger.info('[threshold-ed25519] Using Upstash REST key store for relayer signing share persistence');
    return new UpstashRedisRestThresholdEd25519KeyStore({ url: upstashUrl, token: upstashToken, keyPrefix: envPrefix || undefined });
  }

  const redisUrl = toOptionalTrimmedString(config.REDIS_URL);
  if (redisUrl) {
    if (!input.isNode) {
      input.logger.warn('[threshold-ed25519] REDIS_URL is set but TCP Redis is not supported in this runtime; falling back to in-memory');
      return new InMemoryThresholdEd25519KeyStore();
    }
    input.logger.info('[threshold-ed25519] Using redis-tcp key store for relayer signing share persistence');
    return new RedisTcpThresholdEd25519KeyStore({ redisUrl, keyPrefix: envPrefix || undefined });
  }

  input.logger.info('[threshold-ed25519] Using in-memory key store for relayer signing share (non-persistent)');
  return new InMemoryThresholdEd25519KeyStore();
}
