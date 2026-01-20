import { TatchiPasskey } from '@/core/TatchiPasskey';
import { buildConfigsFromEnv } from '@/core/defaultConfigs';
import type { NearClient } from '@/core/NearClient';
import type { TatchiConfigs, TatchiConfigsInput } from '@/core/types/tatchi';

// Singleton to prevent multiple manager instances in StrictMode and across HMR/module duplication.
//
// IMPORTANT: Only persist on `window` (not Node/SSR globalThis) to avoid leaking
// state across server requests/tests.
type SingletonState = {
  manager: TatchiPasskey | null;
  configKey: string | null;
};

const WINDOW_SINGLETON_KEY = '__w3a_tatchi_passkey_singleton__';

let moduleSingletonState: SingletonState = {
  manager: null,
  configKey: null,
};

function getSingletonState(): SingletonState {
  if (typeof window === 'undefined') return moduleSingletonState;
  const g = globalThis as any;
  if (!g[WINDOW_SINGLETON_KEY]) {
    g[WINDOW_SINGLETON_KEY] = { manager: null, configKey: null } satisfies SingletonState;
  }
  return g[WINDOW_SINGLETON_KEY] as SingletonState;
}

function isDevRuntime(): boolean {
  const env = (globalThis as any)?.process?.env?.NODE_ENV;
  if (env && env !== 'production') return true;
  try {
    const h = typeof window !== 'undefined' ? (window.location.hostname || '') : '';
    if (/localhost|127\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)|\.local(?:host)?$/i.test(h)) return true;
  } catch {}
  return false;
}

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

function computeConfigKey(config: TatchiConfigs): string {
  // Theme is dynamic and controlled via `tatchi.setTheme`; avoid new instances for theme changes.
  return stableStringify(config);
}

export function getOrCreateTatchiManager(config: TatchiConfigsInput, nearClient: NearClient): TatchiPasskey {
  const finalConfig: TatchiConfigs = buildConfigsFromEnv(config);
  const nextKey = computeConfigKey(finalConfig);
  const state = getSingletonState();

  if (!state.manager) {
    if (isDevRuntime()) {
      console.debug('[TatchiContextProvider] Creating manager with config:', finalConfig);
    }
    state.manager = new TatchiPasskey(finalConfig, nearClient);
    state.configKey = nextKey;
    return state.manager;
  }

  // Guardrail: treat config as immutable after the first creation to avoid leaking resources
  // (iframes/workers/listeners) by re-instantiating on re-renders.
  if (state.configKey && state.configKey !== nextKey && isDevRuntime()) {
    console.warn(
      '[TatchiContextProvider] Ignoring config changes after initialization. Ensure you pass a stable config object; theme changes should go through `tatchi.setTheme` or the provider theme prop.',
      { previousKey: state.configKey, nextKey }
    );
  }

  return state.manager;
}
