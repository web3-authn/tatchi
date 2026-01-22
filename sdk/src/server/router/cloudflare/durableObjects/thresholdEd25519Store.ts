// Durable Object implementation for threshold signing state.
//
// This is exported from the SDK so Cloudflare Worker hosts can bind it directly
// (by re-exporting from their Worker entrypoint) without vendoring the code.

type DurableObjectStorageLike = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<boolean>;
  transaction?<T>(fn: (txn: DurableObjectStorageLike) => Promise<T>): Promise<T>;
};

type DurableObjectStateLike = {
  storage: DurableObjectStorageLike;
};

type DoOk<T> = { ok: true; value: T };
type DoErr = { ok: false; code: string; message: string };
type DoResp<T> = DoOk<T> | DoErr;

type DoReq =
  | { op: 'get'; key: string }
  | { op: 'set'; key: string; value: unknown; ttlMs?: number }
  | { op: 'del'; key: string }
  | { op: 'getdel'; key: string }
  | { op: 'authConsumeUse'; key: string }
  | { op: 'authConsumeUseCount'; key: string };

type AuthEntry = {
  record: { expiresAtMs: number; relayerKeyId: string; userId: string; rpId: string; participantIds: number[] };
  remainingUses: number;
  expiresAtMs: number;
};

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers || {}),
    },
  });
}

function ok<T>(value: T): DoOk<T> {
  return { ok: true, value };
}

function err(code: string, message: string): DoErr {
  return { ok: false, code, message };
}

function toKey(input: unknown): string {
  const k = typeof input === 'string' ? input.trim() : '';
  return k;
}

function toTtlSeconds(ttlMs: unknown): number | null {
  if (ttlMs === undefined || ttlMs === null) return null;
  const n = Number(ttlMs);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.ceil(n / 1000));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function parseAuthEntry(raw: unknown): AuthEntry | null {
  if (!isObject(raw)) return null;
  const record = (raw as { record?: unknown }).record;
  const remainingUses = (raw as { remainingUses?: unknown }).remainingUses;
  const expiresAtMs = (raw as { expiresAtMs?: unknown }).expiresAtMs;
  if (!isObject(record)) return null;
  if (typeof remainingUses !== 'number' || !Number.isFinite(remainingUses)) return null;
  if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) return null;
  // Minimal record shape check (full validation happens on the service layer).
  const rec = record as Record<string, unknown>;
  if (typeof rec.userId !== 'string' || typeof rec.rpId !== 'string' || typeof rec.relayerKeyId !== 'string') return null;
  if (typeof rec.expiresAtMs !== 'number' || !Number.isFinite(rec.expiresAtMs)) return null;
  if (!Array.isArray(rec.participantIds)) return null;
  return raw as AuthEntry;
}

async function withTxn<T>(state: DurableObjectStateLike, fn: (store: DurableObjectStorageLike) => Promise<T>): Promise<T> {
  if (typeof state.storage.transaction === 'function') {
    return await state.storage.transaction(fn);
  }
  // Fallback: best-effort single-threaded behavior; DO runtime should support transactions,
  // but don't hard-require it in the SDK.
  return await fn(state.storage);
}

export class ThresholdEd25519StoreDurableObject {
  private readonly state: DurableObjectStateLike;

  constructor(state: DurableObjectStateLike, _env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method.toUpperCase() !== 'POST') {
      return json(err('method_not_allowed', 'POST required'), { status: 405 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    if (!isObject(body)) return json(err('invalid_body', 'Expected JSON object'));
    const op = (body as { op?: unknown }).op;
    if (typeof op !== 'string') return json(err('invalid_body', 'Missing op'));

    const req = body as DoReq;
    if (op === 'get') {
      const key = toKey(req.key);
      if (!key) return json(err('invalid_body', 'Missing key'));
      const value = await this.state.storage.get(key);
      return json(ok(value ?? null));
    }
    if (op === 'set') {
      const key = toKey(req.key);
      if (!key) return json(err('invalid_body', 'Missing key'));
      const ttl = toTtlSeconds((req as { ttlMs?: unknown }).ttlMs);
      await this.state.storage.put(key, (req as { value?: unknown }).value, ttl ? { expirationTtl: ttl } : undefined);
      return json(ok(true));
    }
    if (op === 'del') {
      const key = toKey(req.key);
      if (!key) return json(err('invalid_body', 'Missing key'));
      await this.state.storage.delete(key);
      return json(ok(true));
    }
    if (op === 'getdel') {
      const key = toKey(req.key);
      if (!key) return json(err('invalid_body', 'Missing key'));
      const value = await withTxn(this.state, async (store) => {
        const v = await store.get(key);
        await store.delete(key);
        return v ?? null;
      });
      return json(ok(value));
    }
    if (op === 'authConsumeUse' || op === 'authConsumeUseCount') {
      const key = toKey(req.key);
      if (!key) return json(err('invalid_body', 'Missing key'));

      const res: DoResp<unknown> = await withTxn(this.state, async (store) => {
        const raw = await store.get(key);
        const entry = parseAuthEntry(raw);
        if (!entry) return err('unauthorized', 'threshold session expired or invalid');

        if (Date.now() > entry.expiresAtMs) {
          await store.delete(key);
          return err('unauthorized', 'threshold session expired');
        }
        if (entry.remainingUses <= 0) return err('unauthorized', 'threshold session exhausted');

        entry.remainingUses -= 1;
        const ttlSeconds = Math.max(1, Math.ceil(Math.max(0, entry.expiresAtMs - Date.now()) / 1000));
        await store.put(key, entry, { expirationTtl: ttlSeconds });

        if (op === 'authConsumeUseCount') {
          return ok({ remainingUses: entry.remainingUses });
        }
        return ok({ record: entry.record, remainingUses: entry.remainingUses, expiresAtMs: entry.expiresAtMs });
      });

      return json(res);
    }

    return json(err('invalid_body', `Unknown op: ${op}`));
  }
}
