import type { NormalizedLogger } from '../../logger';
import type {
  CloudflareDurableObjectNamespaceLike,
  ThresholdEd25519KeyStoreConfigInput,
} from '../../types';
import { toOptionalTrimmedString } from '../../../../utils/validation';
import {
  isObject,
  parseThresholdEd25519AuthSessionRecord,
  parseThresholdEd25519CoordinatorSigningSessionRecord,
  parseThresholdEd25519KeyRecord,
  parseThresholdEd25519MpcSessionRecord,
  parseThresholdEd25519SigningSessionRecord,
  toThresholdEd25519AuthPrefix,
  toThresholdEd25519KeyPrefix,
  toThresholdEd25519PrefixFromBase,
  toThresholdEd25519SessionPrefix,
} from '../validation';
import type {
  ThresholdEd25519AuthConsumeResult,
  ThresholdEd25519AuthConsumeUsesResult,
  ThresholdEd25519AuthSessionRecord,
  ThresholdEd25519AuthSessionStore,
} from './AuthSessionStore';
import type { ThresholdEd25519KeyRecord, ThresholdEd25519KeyStore } from './KeyStore';
import type {
  ThresholdEd25519CoordinatorSigningSessionRecord,
  ThresholdEd25519MpcSessionRecord,
  ThresholdEd25519SessionStore,
  ThresholdEd25519SigningSessionRecord,
} from './SessionStore';

type DurableObjectStubLike = { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };

type DoOk<T> = { ok: true; value: T };
type DoErr = { ok: false; code: string; message: string };
type DoResp<T> = DoOk<T> | DoErr;

type DoGetRequest = { op: 'get'; key: string };
type DoSetRequest = { op: 'set'; key: string; value: unknown; ttlMs?: number };
type DoDelRequest = { op: 'del'; key: string };
type DoGetDelRequest = { op: 'getdel'; key: string };
type DoAuthConsumeUseRequest = { op: 'authConsumeUse'; key: string };
type DoAuthConsumeUseCountRequest = { op: 'authConsumeUseCount'; key: string };
type DoRequest =
  | DoGetRequest
  | DoSetRequest
  | DoDelRequest
  | DoGetDelRequest
  | DoAuthConsumeUseRequest
  | DoAuthConsumeUseCountRequest;

type DoAuthEntry = {
  record: ThresholdEd25519AuthSessionRecord;
  remainingUses: number;
  expiresAtMs: number;
};

function isDurableObjectNamespaceLike(v: unknown): v is CloudflareDurableObjectNamespaceLike {
  return Boolean(v)
    && typeof v === 'object'
    && !Array.isArray(v)
    && typeof (v as CloudflareDurableObjectNamespaceLike).idFromName === 'function'
    && typeof (v as CloudflareDurableObjectNamespaceLike).get === 'function';
}

function resolveDoNamespaceFromConfig(config: Record<string, unknown>): CloudflareDurableObjectNamespaceLike | null {
  const direct = (config as { namespace?: unknown }).namespace;
  if (isDurableObjectNamespaceLike(direct)) return direct;

  const alt = (config as { durableObjectNamespace?: unknown }).durableObjectNamespace;
  if (isDurableObjectNamespaceLike(alt)) return alt;

  const envStyle = (config as { THRESHOLD_ED25519_DO_NAMESPACE?: unknown }).THRESHOLD_ED25519_DO_NAMESPACE;
  if (isDurableObjectNamespaceLike(envStyle)) return envStyle;

  return null;
}

function resolveDoStub(input: {
  namespace: CloudflareDurableObjectNamespaceLike;
  objectName: string;
}): DurableObjectStubLike {
  const id = input.namespace.idFromName(input.objectName);
  return input.namespace.get(id) as unknown as DurableObjectStubLike;
}

async function callDo<T>(stub: DurableObjectStubLike, req: DoRequest): Promise<DoResp<T>> {
  const resp = await stub.fetch('https://threshold-store.invalid/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Threshold DO store HTTP ${resp.status}: ${text}`);
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Threshold DO store returned non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!isObject(json)) {
    throw new Error('Threshold DO store returned invalid JSON shape');
  }
  const ok = (json as { ok?: unknown }).ok;
  if (ok === true) return json as DoOk<T>;
  const code = toOptionalTrimmedString((json as { code?: unknown }).code);
  const message = toOptionalTrimmedString((json as { message?: unknown }).message);
  return { ok: false, code: code || 'internal', message: message || 'Threshold DO store error' };
}

function computeAuthPrefix(config: Record<string, unknown>): string {
  const basePrefix = toOptionalTrimmedString(config.THRESHOLD_PREFIX);
  const explicit = toOptionalTrimmedString(config.THRESHOLD_ED25519_AUTH_PREFIX);
  return toThresholdEd25519AuthPrefix(explicit || toThresholdEd25519PrefixFromBase(basePrefix, 'auth'));
}

function computeSessionPrefix(config: Record<string, unknown>): string {
  const basePrefix = toOptionalTrimmedString(config.THRESHOLD_PREFIX);
  const explicit = toOptionalTrimmedString(config.THRESHOLD_ED25519_SESSION_PREFIX);
  return toThresholdEd25519SessionPrefix(explicit || toThresholdEd25519PrefixFromBase(basePrefix, 'sess'));
}

function computeKeyPrefix(config: Record<string, unknown>): string {
  const basePrefix = toOptionalTrimmedString(config.THRESHOLD_PREFIX);
  const explicit = toOptionalTrimmedString(config.THRESHOLD_ED25519_KEYSTORE_PREFIX);
  return toThresholdEd25519KeyPrefix(explicit || toThresholdEd25519PrefixFromBase(basePrefix, 'key'));
}

export class CloudflareDurableObjectThresholdEd25519AuthSessionStore implements ThresholdEd25519AuthSessionStore {
  private readonly stub: DurableObjectStubLike;
  private readonly keyPrefix: string;

  constructor(input: {
    namespace: CloudflareDurableObjectNamespaceLike;
    objectName: string;
    keyPrefix: string;
  }) {
    this.stub = resolveDoStub({ namespace: input.namespace, objectName: input.objectName });
    this.keyPrefix = input.keyPrefix;
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  async putSession(
    id: string,
    record: ThresholdEd25519AuthSessionRecord,
    opts: { ttlMs: number; remainingUses: number },
  ): Promise<void> {
    const ttlMs = Math.max(0, Number(opts.ttlMs) || 0);
    const recordExpiresAtMs = Number((record as { expiresAtMs?: unknown }).expiresAtMs);
    const expiresAtMs =
      Number.isFinite(recordExpiresAtMs) && recordExpiresAtMs > 0
        ? recordExpiresAtMs
        : (Date.now() + ttlMs);
    const ttlFromExpiresAtMs = Math.max(0, expiresAtMs - Date.now());
    const entry: DoAuthEntry = {
      record,
      remainingUses: Math.max(0, Number(opts.remainingUses) || 0),
      expiresAtMs,
    };
    const resp = await callDo<void>(this.stub, { op: 'set', key: this.key(id), value: entry, ttlMs: ttlFromExpiresAtMs });
    if (!resp.ok) throw new Error(resp.message);
  }

  async getSession(id: string): Promise<ThresholdEd25519AuthSessionRecord | null> {
    const resp = await callDo<unknown | null>(this.stub, { op: 'get', key: this.key(id) });
    if (!resp.ok) return null;
    const raw = resp.value;
    const entry = isObject(raw) ? raw as Record<string, unknown> : null;
    const record = entry ? parseThresholdEd25519AuthSessionRecord((entry as { record?: unknown }).record) : null;
    const expiresAtMs = entry ? (entry as { expiresAtMs?: unknown }).expiresAtMs : null;
    if (!record || typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) return null;
    if (Date.now() > expiresAtMs) return null;
    return record;
  }

  async consumeUse(id: string): Promise<ThresholdEd25519AuthConsumeResult> {
    const resp = await callDo<DoAuthEntry>(this.stub, { op: 'authConsumeUse', key: this.key(id) });
    if (!resp.ok) return { ok: false, code: resp.code, message: resp.message };
    return { ok: true, record: resp.value.record, remainingUses: resp.value.remainingUses };
  }

  async consumeUseCount(id: string): Promise<ThresholdEd25519AuthConsumeUsesResult> {
    const resp = await callDo<{ remainingUses: number }>(this.stub, { op: 'authConsumeUseCount', key: this.key(id) });
    if (!resp.ok) return { ok: false, code: resp.code, message: resp.message };
    return { ok: true, remainingUses: resp.value.remainingUses };
  }
}

export class CloudflareDurableObjectThresholdEd25519SessionStore implements ThresholdEd25519SessionStore {
  private readonly stub: DurableObjectStubLike;
  private readonly keyPrefix: string;
  private readonly coordinatorPrefix: string;

  constructor(input: {
    namespace: CloudflareDurableObjectNamespaceLike;
    objectName: string;
    keyPrefix: string;
  }) {
    this.stub = resolveDoStub({ namespace: input.namespace, objectName: input.objectName });
    this.keyPrefix = input.keyPrefix;
    this.coordinatorPrefix = `${this.keyPrefix}coord:`;
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  private coordKey(id: string): string {
    return `${this.coordinatorPrefix}${id}`;
  }

  async putMpcSession(id: string, record: ThresholdEd25519MpcSessionRecord, ttlMs: number): Promise<void> {
    const resp = await callDo<void>(this.stub, { op: 'set', key: this.key(id), value: record, ttlMs });
    if (!resp.ok) throw new Error(resp.message);
  }

  async takeMpcSession(id: string): Promise<ThresholdEd25519MpcSessionRecord | null> {
    const resp = await callDo<unknown | null>(this.stub, { op: 'getdel', key: this.key(id) });
    if (!resp.ok) return null;
    return parseThresholdEd25519MpcSessionRecord(resp.value);
  }

  async putSigningSession(id: string, record: ThresholdEd25519SigningSessionRecord, ttlMs: number): Promise<void> {
    const resp = await callDo<void>(this.stub, { op: 'set', key: this.key(id), value: record, ttlMs });
    if (!resp.ok) throw new Error(resp.message);
  }

  async takeSigningSession(id: string): Promise<ThresholdEd25519SigningSessionRecord | null> {
    const resp = await callDo<unknown | null>(this.stub, { op: 'getdel', key: this.key(id) });
    if (!resp.ok) return null;
    return parseThresholdEd25519SigningSessionRecord(resp.value);
  }

  async putCoordinatorSigningSession(
    id: string,
    record: ThresholdEd25519CoordinatorSigningSessionRecord,
    ttlMs: number,
  ): Promise<void> {
    const resp = await callDo<void>(this.stub, { op: 'set', key: this.coordKey(id), value: record, ttlMs });
    if (!resp.ok) throw new Error(resp.message);
  }

  async takeCoordinatorSigningSession(id: string): Promise<ThresholdEd25519CoordinatorSigningSessionRecord | null> {
    const resp = await callDo<unknown | null>(this.stub, { op: 'getdel', key: this.coordKey(id) });
    if (!resp.ok) return null;
    return parseThresholdEd25519CoordinatorSigningSessionRecord(resp.value);
  }
}

export class CloudflareDurableObjectThresholdEd25519KeyStore implements ThresholdEd25519KeyStore {
  private readonly stub: DurableObjectStubLike;
  private readonly keyPrefix: string;

  constructor(input: {
    namespace: CloudflareDurableObjectNamespaceLike;
    objectName: string;
    keyPrefix: string;
  }) {
    this.stub = resolveDoStub({ namespace: input.namespace, objectName: input.objectName });
    this.keyPrefix = input.keyPrefix;
  }

  private key(relayerKeyId: string): string {
    return `${this.keyPrefix}${relayerKeyId}`;
  }

  async get(relayerKeyId: string): Promise<ThresholdEd25519KeyRecord | null> {
    const id = toOptionalTrimmedString(relayerKeyId);
    if (!id) return null;
    const resp = await callDo<unknown | null>(this.stub, { op: 'get', key: this.key(id) });
    if (!resp.ok) return null;
    return parseThresholdEd25519KeyRecord(resp.value);
  }

  async put(relayerKeyId: string, record: ThresholdEd25519KeyRecord): Promise<void> {
    const id = toOptionalTrimmedString(relayerKeyId);
    if (!id) throw new Error('Missing relayerKeyId');
    const resp = await callDo<void>(this.stub, { op: 'set', key: this.key(id), value: record });
    if (!resp.ok) throw new Error(resp.message);
  }

  async del(relayerKeyId: string): Promise<void> {
    const id = toOptionalTrimmedString(relayerKeyId);
    if (!id) return;
    const resp = await callDo<void>(this.stub, { op: 'del', key: this.key(id) });
    if (!resp.ok) throw new Error(resp.message);
  }
}

export function createCloudflareDurableObjectThresholdEd25519Stores(input: {
  config?: ThresholdEd25519KeyStoreConfigInput | null;
  logger: NormalizedLogger;
}): {
  keyStore: ThresholdEd25519KeyStore;
  sessionStore: ThresholdEd25519SessionStore;
  authSessionStore: ThresholdEd25519AuthSessionStore;
} | null {
  const config = (isObject(input.config) ? input.config : {}) as Record<string, unknown>;
  const namespace = resolveDoNamespaceFromConfig(config);
  const kind = toOptionalTrimmedString(config.kind);
  const enabled = kind === 'cloudflare-do' || (kind === '' && Boolean(namespace));
  if (!enabled) return null;

  if (!namespace) {
    throw new Error('cloudflare-do threshold store selected but no Durable Object namespace was provided (expected config.namespace)');
  }

  const objectName = toOptionalTrimmedString((config as { objectName?: unknown }).objectName)
    || toOptionalTrimmedString((config as { name?: unknown }).name)
    || 'threshold-ed25519-store';

  const authPrefix = computeAuthPrefix(config);
  const sessionPrefix = computeSessionPrefix(config);
  const keyPrefix = computeKeyPrefix(config);

  input.logger.info('[threshold-ed25519] Using Cloudflare Durable Object store for threshold session persistence');

  return {
    keyStore: new CloudflareDurableObjectThresholdEd25519KeyStore({ namespace, objectName, keyPrefix }),
    sessionStore: new CloudflareDurableObjectThresholdEd25519SessionStore({ namespace, objectName, keyPrefix: sessionPrefix }),
    authSessionStore: new CloudflareDurableObjectThresholdEd25519AuthSessionStore({ namespace, objectName, keyPrefix: authPrefix }),
  };
}
