import { TatchiPasskey } from '@/core/TatchiPasskey';
import { buildConfigsFromEnv } from '@/core/defaultConfigs';
import type { NearClient } from '@/core/NearClient';
import type { TatchiConfigs, TatchiConfigsInput } from '@/core/types/tatchi';

// Global singleton to prevent multiple manager instances in StrictMode
let globalPasskeyManager: TatchiPasskey | null = null;
let globalConfigKey: string | null = null;

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): unknown => {
    if (input === null) return null;
    if (input === undefined) return undefined;

    if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return input;
    if (typeof input === 'bigint') return input.toString();

    if (Array.isArray(input)) {
      return input.map((item) => {
        const normalized = normalize(item);
        return normalized === undefined ? null : normalized;
      });
    }

    if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      if (seen.has(obj)) return '[Circular]';
      seen.add(obj);

      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) {
        const normalized = normalize(obj[key]);
        if (normalized !== undefined) out[key] = normalized;
      }
      seen.delete(obj);
      return out;
    }

    // Shouldn't happen for configs; fall back to a string for determinism.
    return String(input);
  };

  return JSON.stringify(normalize(value));
}

export function getOrCreateTatchiManager(config: TatchiConfigsInput, nearClient: NearClient): TatchiPasskey {
  const finalConfig: TatchiConfigs = buildConfigsFromEnv(config);
  const nextKey = stableStringify(finalConfig);
  const configChanged = globalConfigKey !== nextKey;
  if (!globalPasskeyManager || configChanged) {
    console.debug('TatchiContextProvider: Creating manager with config:', finalConfig);
    globalPasskeyManager = new TatchiPasskey(finalConfig, nearClient);
    globalConfigKey = nextKey;
  }
  return globalPasskeyManager as TatchiPasskey;
}
