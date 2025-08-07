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
 *    - Loads from https://example.localhost/sdk/workers/
 *    - copy-sdk-assets.sh ensures co-location
 *    - Relative path works: './filename.wasm'
 *
 * 3. FRONTEND DEV INSTALLING FROM NPM:
 *    - Source: node_modules/@web3authn/passkey/dist/workers/
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
    console.debug(`[${workerName}] Using custom WASM base URL: ${customBaseUrl}`);
    return new URL(wasmFilename, customBaseUrl);
  }

  // Priority 2: Environment variable (for build-time configuration)
  if (typeof process !== 'undefined' && process.env?.WASM_BASE_URL) {
    console.debug(`[${workerName}] Using environment WASM base URL: ${process.env.WASM_BASE_URL}`);
    return new URL(wasmFilename, process.env.WASM_BASE_URL);
  }

  // Priority 3: Worker-specific environment variables
  const workerEnvVar = workerName.toUpperCase().replace(/[^A-Z]/g, '_') + '_WASM_BASE_URL';
  if (typeof process !== 'undefined' && process.env?.[workerEnvVar]) {
    console.debug(`[${workerName}] Using worker-specific environment WASM base URL: ${process.env[workerEnvVar]}`);
    return new URL(wasmFilename, process.env[workerEnvVar]);
  }

  // Priority 4: Worker global configuration (set by consuming application)
  if (typeof self !== 'undefined' && (self as any).WASM_BASE_URL) {
    console.debug(`[${workerName}] Using global WASM base URL: ${(self as any).WASM_BASE_URL}`);
    return new URL(wasmFilename, (self as any).WASM_BASE_URL);
  }

  // Priority 5: Relative path fallback (default - works for most cases)
  // This handles:
  // - SDK building: rolldown puts worker + WASM in same dist/workers/ directory
  // - E2E tests: copy-sdk-assets.sh ensures they're co-located
  // - Simple npm usage: bundlers typically preserve relative relationships
  console.debug(`[${workerName}] Using default relative WASM path`);
  return new URL(`./${wasmFilename}`, import.meta.url);
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
      await initFunction();

      // Run optional validation
      if (validateFunction) {
        await validateFunction();
      }

      // Run optional test
      if (testFunction) {
        await testFunction();
      }

      console.debug(`[${workerName}]: ✅ WASM initialized successfully`);
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
      await initFunction(wasmModule);

      // Run optional validation
      if (validateFunction) {
        await validateFunction();
      }

      // Run optional test
      if (testFunction) {
        await testFunction();
      }

      console.debug(`[${workerName}]: ✅ WASM initialized via network fallback`);
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