import { isObject } from './validation';

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readResult(json: unknown): unknown | null {
  if (!isObject(json) || !('result' in json)) return null;
  const v = (json as Record<string, unknown>).result;
  return v === undefined || v === null ? null : v;
}

export class UpstashRedisRestClient {
  private readonly url: string;
  private readonly token: string;

  constructor(input: { url: string; token: string }) {
    const url = String(input.url || '').trim();
    const token = String(input.token || '').trim();
    if (!url) throw new Error('Upstash client missing url');
    if (!token) throw new Error('Upstash client missing token');
    this.url = url.replace(/\/$/, '');
    this.token = token;
  }

  private async call(path: string, method: 'GET' | 'POST' = 'POST'): Promise<unknown> {
    const resp = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Upstash REST ${resp.status}: ${text}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return { result: text };
    }
  }

  async getRaw(key: string): Promise<unknown | null> {
    const k = encodeURIComponent(key);
    const json = await this.call(`/get/${k}`, 'GET');
    return readResult(json);
  }

  async del(key: string): Promise<void> {
    const k = encodeURIComponent(key);
    await this.call(`/del/${k}`, 'POST');
  }

  async setRaw(key: string, value: string, ttlMs?: number): Promise<void> {
    const k = encodeURIComponent(key);
    const v = encodeURIComponent(value);
    const ttlSeconds =
      ttlMs === undefined ? null : Math.max(1, Math.ceil(Math.max(0, Number(ttlMs) || 0) / 1000));

    if (!ttlSeconds) {
      await this.call(`/set/${k}/${v}`, 'POST');
      return;
    }

    // Prefer path-style EX argument, fallback to query param if needed.
    try {
      await this.call(`/set/${k}/${v}/ex/${ttlSeconds}`, 'POST');
    } catch {
      await this.call(`/set/${k}/${v}?ex=${ttlSeconds}`, 'POST');
    }
  }

  async getJson(key: string): Promise<unknown | null> {
    const raw = await this.getRaw(key);
    if (raw === null) return null;
    if (typeof raw === 'string') return tryParseJson(raw);
    return raw;
  }

  async setJson(key: string, value: unknown, ttlMs?: number): Promise<void> {
    await this.setRaw(key, JSON.stringify(value), ttlMs);
  }

  async getdelJson(key: string): Promise<unknown | null> {
    const k = encodeURIComponent(key);
    try {
      const json = await this.call(`/getdel/${k}`, 'POST');
      const raw = readResult(json);
      if (raw === null) return null;
      if (typeof raw === 'string') return tryParseJson(raw);
      return raw;
    } catch {
      const raw = await this.getJson(key);
      if (raw) await this.del(key);
      return raw;
    }
  }

  async incrby(key: string, delta: number): Promise<number> {
    const k = encodeURIComponent(key);
    const d = encodeURIComponent(String(Math.trunc(Number(delta) || 0)));
    const json = await this.call(`/incrby/${k}/${d}`, 'POST');
    const raw = readResult(json);
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(`Upstash INCRBY returned non-number result: ${String(raw)}`);
    }
    return n;
  }
}

export type RedisResp =
  | { type: 'simple'; value: string }
  | { type: 'error'; value: string }
  | { type: 'integer'; value: number }
  | { type: 'bulk'; value: string | null };

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.length) return b;
  if (!b.length) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function encodeRespArray(args: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  parts.push(`*${args.length}\r\n`);
  for (const arg of args) {
    const s = String(arg);
    const len = encoder.encode(s).length;
    parts.push(`$${len}\r\n${s}\r\n`);
  }
  return encoder.encode(parts.join(''));
}

function parseLine(buf: Uint8Array, start: number): { line: string; next: number } | null {
  for (let i = start; i + 1 < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) {
      const line = new TextDecoder().decode(buf.slice(start, i));
      return { line, next: i + 2 };
    }
  }
  return null;
}

function parseOneResp(buf: Uint8Array): { value: RedisResp; rest: Uint8Array } | null {
  if (!buf.length) return null;
  const prefix = buf[0];
  const head = parseLine(buf, 1);
  if (!head) return null;
  const { line, next } = head;

  if (prefix === 43) { // '+'
    return { value: { type: 'simple', value: line }, rest: buf.slice(next) };
  }
  if (prefix === 45) { // '-'
    return { value: { type: 'error', value: line }, rest: buf.slice(next) };
  }
  if (prefix === 58) { // ':'
    const n = Number(line);
    return { value: { type: 'integer', value: Number.isFinite(n) ? n : 0 }, rest: buf.slice(next) };
  }
  if (prefix === 36) { // '$'
    const len = Number(line);
    if (len === -1) return { value: { type: 'bulk', value: null }, rest: buf.slice(next) };
    if (!Number.isFinite(len) || len < 0) {
      return { value: { type: 'error', value: `Invalid bulk length: ${line}` }, rest: buf.slice(next) };
    }
    const end = next + len;
    if (buf.length < end + 2) return null;
    const data = new TextDecoder().decode(buf.slice(next, end));
    return { value: { type: 'bulk', value: data }, rest: buf.slice(end + 2) };
  }

  return { value: { type: 'error', value: `Unsupported RESP prefix ${prefix}` }, rest: new Uint8Array(0) };
}

type RedisSocket = import('node:net').Socket | import('node:tls').TLSSocket;

export class RedisTcpClient {
  private readonly url: URL;
  private socket: RedisSocket | null = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private pending: Array<{ resolve: (v: RedisResp) => void; reject: (e: unknown) => void }> = [];
  private connecting: Promise<void> | null = null;

  constructor(redisUrl: string) {
    this.url = new URL(redisUrl);
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connect(): Promise<void> {
    const isTls = this.url.protocol === 'rediss:';
    const host = this.url.hostname;
    const port = Number(this.url.port || (isTls ? 6380 : 6379));
    const password = this.url.password ? decodeURIComponent(this.url.password) : '';
    const db = (() => {
      const p = this.url.pathname.replace(/^\//, '');
      if (!p) return null;
      const n = Number(p);
      return Number.isFinite(n) ? n : null;
    })();

    const socket: RedisSocket = isTls
      ? (await import('node:tls')).connect({ host, port, servername: host })
      : (await import('node:net')).connect({ host, port });

    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.once(isTls ? 'secureConnect' : 'connect', () => resolve());
    });

    socket.on('data', (chunk: Buffer) => {
      const next = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      this.buffer = concatBytes(this.buffer, next);
      this.drain();
    });
    socket.on('error', (err: unknown) => {
      this.failAll(err);
      this.socket = null;
    });
    socket.on('close', () => {
      this.failAll(new Error('Redis socket closed'));
      this.socket = null;
    });

    this.socket = socket;

    if (password) {
      const authResp = await this.send(['AUTH', password]);
      if (authResp.type === 'error') throw new Error(`Redis AUTH failed: ${authResp.value}`);
    }
    if (db !== null && db !== 0) {
      const sel = await this.send(['SELECT', String(db)]);
      if (sel.type === 'error') throw new Error(`Redis SELECT failed: ${sel.value}`);
    }
  }

  private drain(): void {
    while (this.pending.length) {
      const parsed = parseOneResp(this.buffer);
      if (!parsed) return;
      this.buffer = parsed.rest;
      const job = this.pending.shift()!;
      job.resolve(parsed.value);
    }
  }

  private failAll(err: unknown): void {
    const list = this.pending.splice(0);
    for (const job of list) job.reject(err);
  }

  async send(args: string[]): Promise<RedisResp> {
    await this.ensureConnected();
    if (!this.socket) throw new Error('Redis socket not connected');
    const payload = encodeRespArray(args);
    const resp = new Promise<RedisResp>((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
    this.socket.write(payload);
    return resp;
  }
}

export async function redisGetJson(client: RedisTcpClient, key: string): Promise<unknown | null> {
  const resp = await client.send(['GET', key]);
  if (resp.type === 'bulk') {
    if (!resp.value) return null;
    return tryParseJson(resp.value);
  }
  if (resp.type === 'error') throw new Error(`Redis GET error: ${resp.value}`);
  return null;
}

export async function redisDel(client: RedisTcpClient, key: string): Promise<void> {
  const resp = await client.send(['DEL', key]);
  if (resp.type === 'error') throw new Error(`Redis DEL error: ${resp.value}`);
}

export async function redisSetJson(
  client: RedisTcpClient,
  key: string,
  value: unknown,
  ttlMs?: number,
): Promise<void> {
  if (ttlMs === undefined) {
    const resp = await client.send(['SET', key, JSON.stringify(value)]);
    if (resp.type === 'error') throw new Error(`Redis SET error: ${resp.value}`);
    return;
  }

  const ttlSeconds = Math.max(1, Math.ceil(Math.max(0, Number(ttlMs) || 0) / 1000));
  const resp = await client.send(['SET', key, JSON.stringify(value), 'EX', String(ttlSeconds)]);
  if (resp.type === 'error') throw new Error(`Redis SET error: ${resp.value}`);
}

export async function redisGetdelJson(client: RedisTcpClient, key: string): Promise<unknown | null> {
  const resp = await client.send(['GETDEL', key]);
  if (resp.type === 'bulk') {
    if (!resp.value) return null;
    return tryParseJson(resp.value);
  }
  if (resp.type === 'error') {
    const msg = resp.value;
    // Redis <6.2 doesn't support GETDEL.
    if (/unknown\s+command|ERR\s+unknown\s+command/i.test(msg)) {
      const raw = await redisGetJson(client, key);
      if (raw) await redisDel(client, key);
      return raw;
    }
    throw new Error(`Redis GETDEL error: ${resp.value}`);
  }
  return null;
}
