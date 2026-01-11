/**
 * ZK-email prover HTTP client.
 *
 * This module is intentionally focused on network I/O and error shaping:
 * - `GET /healthz` (optional, cached with TTL + in-flight de-dupe)
 * - `POST /prove-email` (returns { proof, publicSignals })
 *
 * It is used by `EmailRecoveryService` to keep zk-email proof generation logic
 * readable and to keep fetch/timeout/caching concerns out of the email parsing
 * helpers.
 */

import { stripTrailingSlashes } from '../../../utils/validation';

export type ZkEmailProverHealthzResponse = {
  status?: string;
  ok?: boolean;
};

export interface ZkEmailProverClientOptions {
  /**
   * Base URL for the prover service, e.g. `http://127.0.0.1:5588`.
   * Trailing slashes are ignored.
   */
  baseUrl: string;
  /** Timeout for `/prove-email` (ms). Default: 60000. */
  timeoutMs?: number;
  /**
   * Optional health check behavior (defaults to enabled).
   * Health checks are a cheap `/healthz` call used to fail fast when the prover
   * is unreachable or misconfigured.
   */
  healthCheck?: {
    /** Default: true */
    enabled?: boolean;
    /**
     * Cache TTL for a successful health check (ms). Default: 10000.
     * Set to `0` to perform a health check before every prove call.
     */
    ttlMs?: number;
    /** Timeout for `/healthz` (ms). Default: min(timeoutMs, 5000). */
    timeoutMs?: number;
  };
}

export interface ZkEmailProverResponse {
  proof: unknown;
  publicSignals: string[];
}

/**
 * Error type thrown by `ZkEmailProverClient`.
 *
 * `code` is designed for stable programmatic handling:
 * - `missing_raw_email`
 * - `prover_timeout`
 * - `prover_network_error` (see `causeCode`/`causeMessage`)
 * - `prover_http_error` (non-2xx from `/prove-email`)
 * - `prover_unhealthy` (failed `/healthz` check)
 */
export interface ZkEmailProverError extends Error {
  code: string;
  status?: number;
  causeCode?: string;
  causeMessage?: string;
}

/**
 * Small, stateful client instance. Cache state (health TTL + in-flight promise)
 * is kept per-instance, which makes behavior predictable in long-lived servers.
 */
export class ZkEmailProverClient {
  private readonly baseUrl: string;
  private readonly proveTimeoutMs: number;
  private readonly healthEnabled: boolean;
  private readonly healthTtlMs: number;
  private readonly healthTimeoutMs: number;

  // Health check cache state (in-memory only).
  private healthOkAt = 0;
  private healthInFlight: Promise<void> | null = null;

  constructor(opts: ZkEmailProverClientOptions) {
    const baseUrl = stripTrailingSlashes(opts.baseUrl);
    const proveTimeoutMs = safePositiveInt(opts.timeoutMs ?? 0, 60_000);

    const health = opts.healthCheck || {};
    const healthEnabled = health.enabled !== false;
    const healthTtlMs = safeNonNegativeInt(health.ttlMs ?? 10_000, 10_000);
    const defaultHealthTimeoutMs = Math.min(proveTimeoutMs, 5_000);
    const healthTimeoutMs = safePositiveInt(health.timeoutMs ?? 0, defaultHealthTimeoutMs);

    this.baseUrl = baseUrl;
    this.proveTimeoutMs = proveTimeoutMs;
    this.healthEnabled = healthEnabled;
    this.healthTtlMs = healthTtlMs;
    this.healthTimeoutMs = healthTimeoutMs;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Ensure the prover is healthy.
   *
   * When enabled, this performs a cheap `GET /healthz` and caches success for a
   * short TTL. Calls are de-duped while in-flight.
   */
  async healthz(): Promise<void> {
    if (!this.healthEnabled) return;

    const now = Date.now();
    if (now - this.healthOkAt < this.healthTtlMs) return;

    if (this.healthInFlight) return this.healthInFlight;

    const checkPromise = (async () => {
      const url = this.baseUrl + '/healthz';
      const { res, json } = await this.fetchJsonWithTimeout(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }, this.healthTimeoutMs, {
        timeoutMessage: 'zk-email prover health check timed out',
        networkMessage: 'zk-email prover health check failed',
      });

      if (!res.ok) {
        const err: ZkEmailProverError = Object.assign(
          new Error(`zk-email prover health check failed with status ${res.status}`),
          { code: 'prover_unhealthy', status: res.status }
        );
        throw err;
      }

      const payload = json as ZkEmailProverHealthzResponse;
      const ok = payload?.ok === true || String(payload?.status || '').toLowerCase() === 'ok';
      if (!ok) {
        const err: ZkEmailProverError = Object.assign(
          new Error('zk-email prover health check did not return status=ok'),
          { code: 'prover_unhealthy' }
        );
        throw err;
      }

      this.healthOkAt = Date.now();
    })();

    this.healthInFlight = checkPromise;
    try {
      await checkPromise;
    } finally {
      if (this.healthInFlight === checkPromise) this.healthInFlight = null;
    }
  }

  /**
   * Generate a zk-email proof for a raw RFC822 email.
   *
   * This calls `healthz()` first (if enabled), then `POST /prove-email`.
   */
  async proveEmail(rawEmail: string): Promise<ZkEmailProverResponse> {
    if (!rawEmail || typeof rawEmail !== 'string') {
      const err: ZkEmailProverError = Object.assign(
        new Error('raw email contents are required to generate a zk-email proof'),
        { code: 'missing_raw_email' }
      );
      throw err;
    }

    await this.healthz();

    const url = this.baseUrl + '/prove-email';
    const { res, json } = await this.fetchJsonWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawEmail }),
    }, this.proveTimeoutMs, {
      timeoutMessage: 'zk-email prover request timed out',
      networkMessage: 'zk-email prover request failed',
    });

    if (!res.ok) {
      const err: ZkEmailProverError = Object.assign(
        new Error(json?.error || `zk-email prover request failed with status ${res.status}`),
        { code: 'prover_http_error', status: res.status }
      );
      throw err;
    }

    return json as ZkEmailProverResponse;
  }

  /**
   * Internal helper for JSON-over-HTTP calls with AbortController timeout.
   *
   * Always attempts to parse JSON; on parse failure returns `{}`.
   */
  private async fetchJsonWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    messages: { timeoutMessage: string; networkMessage: string }
  ): Promise<{ res: Response; json: any }> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const id = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller?.signal,
      } as RequestInit);

      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

      return { res, json };
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw makeTimeoutError(messages.timeoutMessage);
      }
      throw makeNetworkError(messages.networkMessage, e);
    } finally {
      if (id !== undefined) clearTimeout(id);
    }
  }
}

// ----------------------------
// Internal helpers (non-export)
// ----------------------------

function safePositiveInt(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function safeNonNegativeInt(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function getCauseInfo(e: any): { cause: any; causeCode?: string; causeMessage?: string } {
  const cause = e?.cause;
  const causeCode =
    typeof cause?.code === 'string'
      ? (cause.code as string)
      : typeof e?.code === 'string'
        ? (e.code as string)
        : undefined;
  const causeMessage =
    typeof cause?.message === 'string'
      ? (cause.message as string)
      : typeof e?.message === 'string'
        ? (e.message as string)
        : undefined;
  return { cause, causeCode, causeMessage };
}

function makeNetworkError(message: string, e: any): ZkEmailProverError {
  const { cause, causeCode, causeMessage } = getCauseInfo(e);
  const err: ZkEmailProverError = Object.assign(
    new Error(message),
    { code: 'prover_network_error', causeCode, causeMessage }
  );
  (err as any).cause = cause ?? e;
  return err;
}

function makeTimeoutError(message: string): ZkEmailProverError {
  return Object.assign(new Error(message), { code: 'prover_timeout' });
}
