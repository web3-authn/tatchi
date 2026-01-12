/**
 * WASM worker loading overview
 *
 * Environments and how URLs are resolved:
 *
 * - Production (wallet origin)
 *   - WASM Workers live under the wallet site at `${walletOrigin}/sdk/workers/*`.
 *   - COOP/COEP/CORP and CORS headers must be present on the wallet site;
 *     `.wasm` must be served with `Content-Type: application/wasm`.
 *   - The wallet iframe announces `window.__W3A_WALLET_SDK_BASE__ = ${walletOrigin}/sdk/`.
 *   - resolveWorkerBaseOrigin() uses that base; resolveWasmUrl() uses the bundler-relative
 *     URL first (import.meta.url) and falls back to `/sdk/workers/*` when needed.
 *
 * - Development (same‑origin)
 *   - Vite dev plugin serves `/sdk/*` and `/sdk/workers/*` from the SDK dist output.
 *   - import.meta.url and relative paths work; prewarm is allowed.
 *
 * - Development (cross‑origin: app + wallet on different hosts)
 *   - The app does not construct workers from its own origin to avoid SecurityError.
 *     Workers prewarm inside the wallet iframe (wallet origin) instead.
 *   - Loading WASM via network fallback requires CORS + correct MIME on the wallet origin.
 *
 * - CI / Node
 *   - Consumers may set `process.env.WASM_BASE_URL` or a worker‑specific
 *     `${WORKER_NAME}_WASM_BASE_URL` to override the base explicitly.
 *   - A global `self.WASM_BASE_URL` is also supported when running in workers.
 *
 * Path Resolution Strategy summary:
 * - resolveWasmUrl() picks the most explicit hint first (customBaseUrl, env, globals),
 *   then tries bundler‑relative (import.meta.url), and finally falls back to `/sdk/workers/*`.
 * - initializeWasm() prefers the "bundled" module_or_path (fast, reliable), then
 *   falls back to a network fetch + `WebAssembly.compile` (works regardless of MIME),
 *   with a timeout and optional fallback module factory for graceful degradation.
 */

export interface WasmLoaderOptions {
  workerName: string;
  wasmUrl: URL;
  initFunction: (wasmModule?: any) => Promise<void>;
  validateFunction?: () => void | Promise<void>;
  timeoutMs?: number;
  createFallbackModule?: (errorMessage: string) => any;
  testFunction?: () => void | Promise<void>;
}

/**
 * Resolve a WASM binary URL for a given worker.
 * Priority order:
 * 1) Custom base URL provided by the caller
 * 2) process.env.WASM_BASE_URL
 * 3) process.env[`${WORKER_NAME}_WASM_BASE_URL`]
 * 4) self.WASM_BASE_URL (when running inside a worker)
 * 5) Bundler‑relative URL via import.meta.url
 * 6) Fallback `/sdk/workers/${wasmFilename}` under the current origin
 *
 * @param wasmFilename - Name of the WASM binary, e.g. `wasm_vrf_worker_bg.wasm`.
 * @param workerName - Human‑readable worker name for logs and env var lookup.
 * @param customBaseUrl - Optional absolute base URL that takes precedence over env/globals.
 * @returns Absolute URL to the resolved WASM binary.
 */
export function resolveWasmUrl(wasmFilename: string, workerName: string, customBaseUrl?: string): URL {
  if (customBaseUrl) {
    return new URL(wasmFilename, customBaseUrl);
  }
  if (typeof process !== 'undefined' && (process as any).env?.WASM_BASE_URL) {
    return new URL(wasmFilename, (process as any).env.WASM_BASE_URL);
  }
  const workerEnvVar = workerName.toUpperCase().replace(/[^A-Z]/g, '_') + '_WASM_BASE_URL';
  if (typeof process !== 'undefined' && (process as any).env?.[workerEnvVar]) {
    return new URL(wasmFilename, (process as any).env[workerEnvVar]);
  }
  if (typeof self !== 'undefined' && (self as any).WASM_BASE_URL) {
    return new URL(wasmFilename, (self as any).WASM_BASE_URL);
  }
  try {
    let metaUrl: string | null = null;
    try {
      metaUrl = (typeof import.meta !== 'undefined' && (import.meta as any)?.url)
        ? (import.meta as any).url as string
        : null;
    } catch { metaUrl = null; }
    const baseUrl = metaUrl || ((self as any)?.location?.href) || '/';
    return new URL(`./${wasmFilename}`, baseUrl);
  } catch {
    return new URL(`/sdk/workers/${wasmFilename}`, ((self as any)?.location?.origin) || '/');
  }
}

/**
 * Initialize a WASM module with robust fallbacks and diagnostics.
 *
 * - PRIMARY: pass a URL (or module) to the WASM `initFunction` so bundlers rewrite
 *   it to the correct asset in production. This is the fastest & most reliable path.
 * - FALLBACK: if the bundled path fails (e.g., due to a bundler quirk), fetch the
 *   WASM over the network and compile via `WebAssembly.compile(ArrayBuffer)`.
 *   This sidesteps MIME issues and works in strict environments.
 * - TIMEOUT: guard initialization with a timeout; optionally create a fallback module
 *   via `createFallbackModule` to keep the worker responsive in degraded conditions.
 *
 * @param options - Configuration for WASM initialization: worker name, URL, and hooks.
 * @returns A truthy value on success (or a fallback module if provided). Throws on failure.
 */
export async function initializeWasm(options: WasmLoaderOptions): Promise<any> {
  const {
    workerName,
    wasmUrl,
    initFunction,
    validateFunction,
    testFunction,
    createFallbackModule,
    timeoutMs = 20000
  } = options;

  console.debug(`[${workerName}]: Starting WASM initialization...`, {
    wasmUrl: wasmUrl.href,
    userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    currentUrl: (typeof self !== 'undefined' ? (self as any).location?.href : '')
  });

  const initWithTimeout = async (): Promise<any> => {
    try {
      console.debug(`[${workerName}]: Using bundled WASM (SDK-optimized approach)`);
      await initFunction({ module_or_path: wasmUrl as any });
      if (validateFunction) await validateFunction();
      if (testFunction) await testFunction();
      console.debug(`[${workerName}]: WASM initialized successfully`);
      return true;
    } catch (bundledError: any) {
      console.warn(`[${workerName}]: Bundled WASM unavailable, attempting network fallback:`, bundledError?.message);
    }

    try {
      const fetchAndInit = async (url: URL, label: string): Promise<void> => {
        console.debug(`[${workerName}]: Fetching WASM (${label}):`, url.href);
        const response = await fetch(url.href, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const wasmModule = await WebAssembly.compile(arrayBuffer);
        await initFunction({ module_or_path: wasmModule as any });
        if (validateFunction) await validateFunction();
        if (testFunction) await testFunction();
      };

      try {
        await fetchAndInit(wasmUrl, 'network fallback');
        console.debug(`[${workerName}]: WASM initialized via network fallback`);
        return true;
      } catch (networkError: any) {
        const msg = String(networkError?.message || networkError || '');
        const looksLikeStaleCacheMismatch =
          msg.includes('__wbindgen_closure_wrapper') ||
          msg.includes('function import requires a callable') ||
          /WebAssembly\.instantiate\(\): Import #\d+ "wbg"/.test(msg);

        // This class of error is commonly caused by a stale cached `.wasm` being served
        // alongside a newer worker JS bundle (wasm-bindgen import table mismatch).
        // Retry once with a cache-busting query param to force a fresh fetch.
        if (looksLikeStaleCacheMismatch) {
          const busted = new URL(wasmUrl.href);
          busted.searchParams.set('v', String(Date.now()));
          await fetchAndInit(busted, 'cache-bust retry');
          console.debug(`[${workerName}]: WASM initialized after cache-bust retry`);
          return true;
        }

        throw networkError;
      }
    } catch (networkError: any) {
      console.error(`[${workerName}]: All WASM initialization methods failed`);
      const helpfulMessage = `\n${workerName.toUpperCase()} WASM initialization failed. This may be due to:\n1. Server MIME type configuration (WASM files should be served with 'application/wasm')\n2. Network connectivity issues\n3. CORS policy restrictions\n4. Missing WASM files in deployment\n5. SDK packaging problems\n\nOriginal error: ${networkError?.message}\n`.trim();
      if (createFallbackModule) {
        console.warn(`[${workerName}]: Creating fallback module due to WASM initialization failure`);
        return createFallbackModule(helpfulMessage);
      }
      throw new Error(helpfulMessage);
    }
  };

  let timeoutId: any;
  try {
    const result = await Promise.race([
      initWithTimeout(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`WASM initialization timeout after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
    clearTimeout(timeoutId);
    return result;
  } catch (timeoutError: any) {
    console.error(`[${workerName}]: WASM initialization failed:`, timeoutError?.message);
    if (createFallbackModule) {
      console.warn(`[${workerName}]: Creating fallback module due to timeout`);
      return createFallbackModule(timeoutError.message);
    }
    throw timeoutError;
  }
}
