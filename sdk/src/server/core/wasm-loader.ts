/**
 * WASM Module Loading Utilities for Serverless Environments
 *
 * This module provides utilities for loading WebAssembly modules in various
 * JavaScript runtimes, with special handling for Cloudflare Workers where
 * import.meta.url and filesystem access are not available.
 */

export function isNodeEnvironment(): boolean {
  return Boolean((globalThis as any).process?.versions?.node);
}

export function isCloudflareWorkers(): boolean {
  return !isNodeEnvironment() && typeof (globalThis as any).caches !== 'undefined';
}

/**
 * Determine the type of WASM module input for logging and validation
 */
export function getWasmInputType(input: unknown): string {
  if (!input) return 'null/undefined';
  if (input instanceof WebAssembly.Module) return 'WebAssembly.Module';
  if (input instanceof Response) return 'Response';
  if (input instanceof ArrayBuffer) return 'ArrayBuffer';
  if (ArrayBuffer.isView(input)) return 'TypedArray';
  if (input instanceof URL) return 'URL';
  if (typeof input === 'string') return 'string';
  return `${typeof input} (${Object.prototype.toString.call(input)})`;
}

export function createWasmLogger(prefix: string) {
  return (msg: string): void => {
    try {
      console.log(`[${prefix}] ${msg}`);
    } catch {
      // Ignore logging errors
    }
  };
}

/**
 * Resolve string path to URL (Node.js only - fails in Cloudflare Workers)
 * @throws Error in Cloudflare Workers or if URL construction fails
 */
export function resolveStringPath(path: string, baseUrl: string): URL {
  if (isCloudflareWorkers()) {
    throw new Error(
      'WASM module paths cannot be resolved from strings in Cloudflare Workers. ' +
      'import.meta.url does not work reliably. ' +
      'Please provide a WebAssembly.Module via the moduleOrPath config option.'
    );
  }

  if (!isNodeEnvironment()) {
    throw new Error(
      'WASM module string paths require Node.js environment. ' +
      'In browsers, pass the WASM module directly as WebAssembly.Module or Response.'
    );
  }

  try {
    return new URL(path, baseUrl);
  } catch (err) {
    throw new Error(`Failed to construct URL from path "${path}" and base "${baseUrl}": ${err}`);
  }
}

/**
 * Load WASM module from filesystem (Node.js only)
 */
export async function loadWasmFromFilesystem(url: URL): Promise<WebAssembly.Module> {
  if (!isNodeEnvironment()) {
    throw new Error('Filesystem loading requires Node.js environment');
  }

  const { fileURLToPath } = await import('node:url');
  const { readFile } = await import('node:fs/promises');

  const filePath = fileURLToPath(url);
  const wasmBuffer = await readFile(filePath);
  // Convert Buffer to Uint8Array for WebAssembly.compile compatibility
  return await WebAssembly.compile(new Uint8Array(wasmBuffer));
}

export type WasmModuleSupplier<T = any> =
  | T  // Direct module (WebAssembly.Module, Response, ArrayBuffer, etc.)
  | Promise<T>
  | (() => T | Promise<T>);

/**
 * Unwrap function suppliers to get the actual module/path
 */
export async function unwrapSupplier<T>(supplier: WasmModuleSupplier<T>): Promise<T> {
  const candidate = typeof supplier === 'function'
    ? (supplier as () => T | Promise<T>)()
    : supplier;

  return await candidate;
}

/**
 * Options for WASM module resolution
 */
export interface WasmResolverOptions {
  /** Base URL for resolving relative paths (typically import.meta.url) */
  baseUrl?: string;
  /** Logger function for debugging */
  log?: (msg: string) => void;
  /** Candidate URLs to try for fallback loading */
  fallbackUrls?: URL[];
}

/**
 * Resolve WASM module override to a format accepted by wasm-bindgen
 *
 * Supports:
 * - WebAssembly.Module (direct)
 * - Response (from fetch)
 * - ArrayBuffer / TypedArray
 * - String paths (Node.js only)
 * - URL objects
 * - Functions that return any of the above
 *
 * @throws Error if resolution fails or unsupported type in wrong environment
 */
export async function resolveWasmModule<T = any>(
  supplier: WasmModuleSupplier<T>,
  options: WasmResolverOptions = {}
): Promise<T> {
  const { baseUrl = '', log = () => {} } = options;

  // Unwrap function suppliers
  const resolved = await unwrapSupplier(supplier);

  if (!resolved) {
    throw new Error('WASM module supplier resolved to empty value');
  }

  const inputType = getWasmInputType(resolved);
  log(`resolved module type: ${inputType}`);

  // Handle string paths (Node.js only)
  if (typeof resolved === 'string') {
    if (!baseUrl) {
      throw new Error('baseUrl required for resolving string paths');
    }
    const url = resolveStringPath(resolved, baseUrl);
    log(`resolved string path to URL: ${url.toString()}`);
    return url as T;
  }

  // All other types pass through directly to wasm-bindgen
  return resolved;
}

/**
 * Initialize WASM module from filesystem candidates (Node.js only)
 */
export async function initWasmFromFilesystem<InitFn extends (input: any) => Promise<any>>(
  initFn: InitFn,
  candidates: URL[],
  options: { log?: (msg: string) => void } = {}
): Promise<boolean> {
  const { log = () => {} } = options;

  if (!isNodeEnvironment()) {
    return false;
  }

  try {
    for (const url of candidates) {
      try {
        log(`attempting filesystem load: ${url.toString()}`);
        const module = await loadWasmFromFilesystem(url);
        await initFn({ module_or_path: module });
        log(`successfully loaded from filesystem: ${url.toString()}`);
        return true;
      } catch (err) {
        log(`filesystem load failed for ${url.toString()}: ${(err as Error)?.message}`);
        // Continue to next candidate
      }
    }
  } catch (err) {
    log(`filesystem loading error: ${(err as Error)?.message}`);
  }

  return false;
}

/**
 * Initialize WASM from URL candidates (Node.js and browsers)
 */
export async function initWasmFromUrls<InitFn extends (input: any) => Promise<any>>(
  initFn: InitFn,
  candidates: URL[],
  options: { log?: (msg: string) => void } = {}
): Promise<void> {
  const { log = () => {} } = options;

  let lastError: unknown = null;

  for (const url of candidates) {
    try {
      log(`attempting URL load: ${url.toString()}`);
      await initFn({ module_or_path: url });
      log(`successfully loaded from URL: ${url.toString()}`);
      return;
    } catch (err) {
      lastError = err;
      log(`URL load failed for ${url.toString()}: ${(err as Error)?.message}`);
    }
  }

  throw lastError ?? new Error('Failed to load WASM from any candidate URL');
}

/**
 * Create a WASM loading strategy with fallback support
 *
 * Priority order:
 * 1. Explicit override (required for Cloudflare Workers)
 * 2. Node.js filesystem (development)
 * 3. URL-based loading (Node.js/browsers)
 */
export function createWasmLoader<InitFn extends (input: any) => Promise<any>>(
  initFn: InitFn,
  options: {
    logPrefix?: string;
    baseUrl?: string;
    fallbackUrls?: URL[];
  } = {}
) {
  const { logPrefix = 'WasmLoader', baseUrl = '', fallbackUrls = [] } = options;
  const log = createWasmLogger(logPrefix);

  return {
    /**
     * Load WASM from explicit override (required for Cloudflare Workers)
     */
    async loadFromOverride(override: WasmModuleSupplier): Promise<void> {
      log(`loading from override (type: ${typeof override})`);

      try {
        const resolved = await resolveWasmModule(override, { baseUrl, log });
        log(`calling init function with resolved module`);
        await initFn({ module_or_path: resolved });
        log(`successfully initialized from override`);
      } catch (err) {
        const errMsg = (err as Error)?.message || String(err);
        log(`FATAL: override loading failed: ${errMsg}`);

        // In Cloudflare Workers, we cannot fall back to URL loading
        if (isCloudflareWorkers()) {
          throw new Error(
            `WASM override failed in Cloudflare Workers: ${errMsg}. ` +
            `URL-based fallback is not available. Please ensure moduleOrPath is correctly configured.`
          );
        }

        throw err;
      }
    },

    /**
     * Load WASM from fallback URLs (Node.js/browsers only)
     */
    async loadFromFallbacks(): Promise<void> {
      if (!fallbackUrls.length) {
        throw new Error('No fallback URLs configured');
      }

      // Try filesystem first in Node.js
      if (isNodeEnvironment()) {
        log(`attempting Node.js filesystem loading`);
        const loaded = await initWasmFromFilesystem(initFn, fallbackUrls, { log });
        if (loaded) {
          log(`successfully loaded from filesystem`);
          return;
        }
      }

      // Try URL-based loading
      log(`attempting URL-based loading`);
      await initWasmFromUrls(initFn, fallbackUrls, { log });
    },

    /**
     * Load WASM with full fallback chain
     */
    async load(override?: WasmModuleSupplier | null): Promise<void> {
      // Try override first
      if (override) {
        try {
          await this.loadFromOverride(override);
          return;
        } catch (err) {
          // If we're in Cloudflare Workers, override failure is fatal
          if (isCloudflareWorkers()) {
            throw err;
          }
          log(`override failed, trying fallbacks`);
        }
      }

      // Warn if no override in Cloudflare Workers
      if (isCloudflareWorkers() && !override) {
        log(
          `WARNING: No WASM override in Cloudflare Workers. ` +
          `This will likely fail. Configure moduleOrPath in your service config.`
        );
      }

      // Try fallbacks
      await this.loadFromFallbacks();
    },
  };
}

