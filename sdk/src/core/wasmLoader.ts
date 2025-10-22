/**
 * Shared WASM Loading Utility for Web Workers
 */

export interface WasmLoaderOptions {
  /** Worker name for logging (e.g., 'signer-worker', 'vrf-worker') */
  workerName: string;
  /** WASM URL for network fallback */
  wasmUrl: URL;
  /** WASM module init function (from wasm-bindgen) */
  initFunction: (wasmModule?: any) => Promise<void>;
  /** Optional validation function to run after WASM initialization */
  validateFunction?: () => void | Promise<void>;
  /** Optional timeout in milliseconds (default: 20000) */
  timeoutMs?: number;
  /** Optional fallback factory for creating error-handling modules */
  createFallbackModule?: (errorMessage: string) => any;
  /** Optional initialization test function */
  testFunction?: () => void | Promise<void>;
}

/**
 * WASM Asset Path Resolution Strategy
 *
 * Resolves WASM file URLs with configurable base path support for different deployment scenarios:
 *
 * 1. SDK BUILDING (Rolldown):
 *    - Rolldown bundles worker + WASM into dist/workers/
 *    - Both worker.js and wasm files in same directory
 *    - Relative path works: './filename.wasm'
 *
 * 2. PLAYWRIGHT E2E TESTS:
 *    - Loads from http://localhost:5173/sdk/workers/ via the Vite dev plugin
 *    - The plugin serves SDK assets from the SDK dist/ output
 *    - Relative path works: './filename.wasm'
 *
 * 3. FRONTEND DEV INSTALLING FROM NPM:
 *    - Source: node_modules/@tatchi/dist/workers/
 *    - Potential Issues: bundler separation, custom paths, CDN hosting
 *    - Configuration options available
 *
 * @param wasmFilename - Name of the WASM file (e.g., 'wasm_vrf_worker_bg.wasm')
 * @param workerName - Worker name for logging (e.g., 'VRF Worker', 'Signer Worker')
 * @param customBaseUrl - Optional custom base URL for WASM assets
 * @returns URL object pointing to the WASM binary
 */
export function resolveWasmUrl(wasmFilename: string, workerName: string, customBaseUrl?: string): URL {
  // Priority 1: Custom base URL (for npm consumers with complex setups)
  if (customBaseUrl) {
    return new URL(wasmFilename, customBaseUrl);
  }

  // Priority 2: Environment variable (for build-time configuration)
  if (typeof process !== 'undefined' && process.env?.WASM_BASE_URL) {
    return new URL(wasmFilename, process.env.WASM_BASE_URL);
  }

  // Priority 3: Worker-specific environment variables
  const workerEnvVar = workerName.toUpperCase().replace(/[^A-Z]/g, '_') + '_WASM_BASE_URL';
  if (typeof process !== 'undefined' && process.env?.[workerEnvVar]) {
    return new URL(wasmFilename, process.env[workerEnvVar]);
  }

  // Priority 4: Worker global configuration (set by consuming application)
  if (typeof self !== 'undefined' && (self as any).WASM_BASE_URL) {
    return new URL(wasmFilename, (self as any).WASM_BASE_URL);
  }

  // Priority 5: Relative path fallback (default - works for most cases)
  // This handles:
  // - SDK building: bundlers put worker + WASM in the same directory
  // - E2E tests: Vite dev plugin serves co-located worker + WASM under /sdk/workers
  // - Simple npm usage: bundlers typically preserve relative relationships
  try {
    // Try to resolve via import.meta.url when available (ESM/module workers)
    let metaUrl: string | null = null;
    try {
      metaUrl = (typeof import.meta !== 'undefined' && import.meta?.url)
        ? import.meta.url as string
        : null;
    } catch {
      metaUrl = null;
    }
    const baseUrl = metaUrl || (self?.location?.href) || '/';
    const resolved = new URL(`./${wasmFilename}`, baseUrl);
    return resolved;
  } catch {
    // Last resort: root-relative under /sdk/workers in dev
    const fallback = new URL(`/sdk/workers/${wasmFilename}`, self?.location?.origin || '/');
    return fallback;
  }
}

/**
 * Initialize WASM module with SDK-optimized loading strategy
 * Prioritizes bundled WASM for maximum reliability across deployment environments
 * Returns the initialized module or a fallback module with error handling
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
    userAgent: navigator.userAgent,
    currentUrl: self.location.href
  });

  // Wrap the entire initialization with timeout protection
  const initWithTimeout = async (): Promise<any> => {
    // PRIMARY: Use bundled WASM (most reliable for SDK distribution)
    try {
      console.debug(`[${workerName}]: Using bundled WASM (SDK-optimized approach)`);
      // Pass resolved URL to initializer so bundlers rewrite to the correct asset
      // Use new single-object signature to avoid deprecation warnings
      await initFunction({ module_or_path: wasmUrl as any });

      // Run optional validation
      if (validateFunction) {
        await validateFunction();
      }

      // Run optional test
      if (testFunction) {
        await testFunction();
      }

      console.debug(`[${workerName}]: WASM initialized successfully`);
      return true; // Success indicator
    } catch (bundledError: any) {
      console.warn(`[${workerName}]: Bundled WASM unavailable, attempting network fallback:`, bundledError.message);
    }

    // FALLBACK: Network loading with robust error handling (only if bundled fails)
    try {
      console.debug(`[${workerName}]: Fetching WASM from network:`, wasmUrl.href);
      const response = await fetch(wasmUrl.href);

      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      console.debug(`[${workerName}]: WASM fetch successful, content-type:`, contentType);

      // Use ArrayBuffer approach (works regardless of MIME type)
      const arrayBuffer = await response.arrayBuffer();
      const wasmModule = await WebAssembly.compile(arrayBuffer);
      // Use the same object-based init for compiled module
      await initFunction({ module_or_path: wasmModule as any });

      // Run optional validation
      if (validateFunction) {
        await validateFunction();
      }

      // Run optional test
      if (testFunction) {
        await testFunction();
      }

      console.debug(`[${workerName}]: WASM initialized via network fallback`);
      return true; // Success indicator

    } catch (networkError: any) {
      console.error(`[${workerName}]: All WASM initialization methods failed`);

      // Create comprehensive error message
      const helpfulMessage = `
${workerName.toUpperCase()} WASM initialization failed. This may be due to:
1. Server MIME type configuration (WASM files should be served with 'application/wasm')
2. Network connectivity issues
3. CORS policy restrictions
4. Missing WASM files in deployment
5. SDK packaging problems

Original error: ${networkError.message}

The SDK attempted multiple loading strategies but all failed.
For production deployment, ensure your server serves .wasm files with the correct MIME type.
      `.trim();

      // If fallback module factory provided, create fallback instead of throwing
      if (createFallbackModule) {
        console.warn(`[${workerName}]: Creating fallback module due to WASM initialization failure`);
        return createFallbackModule(helpfulMessage);
      }

      throw new Error(helpfulMessage);
    }
  };

  // Race initialization against timeout
  try {
    let timeoutId: NodeJS.Timeout;
    const result = await Promise.race([
      initWithTimeout(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`WASM initialization timeout after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);

    // Clear timeout if initialization succeeds
    clearTimeout(timeoutId!);
    return result;
  } catch (timeoutError: any) {
    console.error(`[${workerName}]: WASM initialization failed:`, timeoutError.message);

    // If fallback module factory provided, create fallback for timeout as well
    if (createFallbackModule) {
      console.warn(`[${workerName}]: Creating fallback module due to timeout`);
      return createFallbackModule(timeoutError.message);
    }

    throw timeoutError;
  }
}

/**
 * Resolve the base origin for worker scripts.
 * Priority:
 * 1) window.__W3A_EMBEDDED_BASE__ (absolute `${walletOrigin}${sdkBasePath}/`) → take its origin
 * 2) window.location.origin (host/app origin)
 */
export function resolveWorkerBaseOrigin(): string {
  let origin = ''
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      origin = window.location.origin
    }
    const w = window as unknown as { __W3A_EMBEDDED_BASE__?: string }
    const embeddedBase = w?.__W3A_EMBEDDED_BASE__
    if (embeddedBase) {
      origin = new URL(embeddedBase, origin || 'https://invalid.local').origin
    }
  } catch {}
  return origin
}

/**
 * Build an absolute worker script URL from a path or absolute URL.
 * If `input` is a path (e.g., `/sdk/workers/foo.js`), it will be resolved
 * against the wallet origin (from `__W3A_EMBEDDED_BASE__`) when available,
 * otherwise against the host origin.
 */
export function resolveWorkerScriptUrl(input: string): string {
  try {
    // Absolute URL string stays as-is (normalized by URL constructor)
    if (/^https?:\/\//i.test(input)) {
      return new URL(input).toString()
    }
    const baseOrigin = resolveWorkerBaseOrigin() || (typeof window !== 'undefined' ? window.location.origin : '') || 'https://invalid.local'
    return new URL(input, baseOrigin).toString()
  } catch {
    // Best-effort fallback
    try { return new URL(input, (typeof window !== 'undefined' ? window.location.origin : 'https://invalid.local')).toString() } catch {}
    return input
  }
}
