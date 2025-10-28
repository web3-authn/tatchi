import React from 'react';
import type { PasskeyContextProviderProps } from '../types';
import { setEmbeddedBase } from '../../core/sdkPaths';

// Internal: Add preconnect/prefetch hints for wallet service + relayer and
// expose an absolute embedded asset base for srcdoc iframes.
//
// What this hook does
// - Adds resource hints for the configured wallet origin (dns‑prefetch, preconnect, prefetch)
//   and modulepreload for the wallet host script.
// - Sets `window.__W3A_EMBEDDED_BASE__` to an absolute `${walletOrigin}${sdkBasePath}/` so
//   any embedded srcdoc iframes created by the SDK load ESM bundles from the wallet origin,
//   not from the host app origin.
//
// Requirements
// - `config.iframeWallet.walletOrigin` points to the wallet site (e.g. https://web3authn.org)
// - `config.iframeWallet.sdkBasePath` (default '/sdk') is served on that wallet site
// - `config.iframeWallet.walletServicePath` (default '/service' or '/wallet-service') is reachable
//
// Gotchas
// - Always resolve `${sdkBasePath}/...` with a trailing slash; otherwise `new URL('file', '/sdk')`
//   becomes `/file` instead of `/sdk/file`.
// - For cross‑origin module/worker imports, ensure the wallet site sends CORS headers for
//   `/sdk/*` and `/sdk/workers/*` (e.g. `Access-Control-Allow-Origin: *`) and `.wasm` has
//   `Content-Type: application/wasm`.
// - `/wallet-service` may 308 → `/wallet-service/` on Pages; both are fine.
export function usePreconnectWalletAssets(config: PasskeyContextProviderProps['config']): void {
  // Derive stable primitives to avoid re-running the effect on object identity changes.
  const walletOrigin = config?.iframeWallet?.walletOrigin as string | undefined;
  const servicePath = config?.iframeWallet?.walletServicePath || '/service';
  const sdkBasePath = config?.iframeWallet?.sdkBasePath || '/sdk';
  const relayerUrl = config?.relayer?.url as string | undefined;

  React.useEffect(() => {
    try {
      if (typeof document === 'undefined') return;
      // Determine cross‑origin once per effect and expose absolute embedded base
      // for srcdoc iframes ONLY when wallet is cross‑origin.
      let isCrossOrigin = false;
      let walletOriginOrigin: string | undefined = undefined;
      try {
        if (walletOrigin) {
          walletOriginOrigin = new URL(walletOrigin, window.location.href).origin;
          const parentOrigin = window.location.origin;
          isCrossOrigin = walletOriginOrigin !== parentOrigin;
          if (isCrossOrigin) {
            const sdkPath = (sdkBasePath || '/sdk') as string;
            const withSlash = sdkPath.endsWith('/') ? sdkPath : sdkPath + '/';
            const abs = new URL(withSlash, walletOriginOrigin).toString();
            setEmbeddedBase(abs);
          }
        }
      } catch {}
      const ensureLink = (rel: string, href?: string, attrs?: Record<string, string>) => {
        try {
          if (!href) return;
          const head = document.head || document.getElementsByTagName('head')[0];
          if (!head) return;
          const selector = `link[rel="${rel}"][href="${href}"]`;
          if (head.querySelector(selector)) return;
          const link = document.createElement('link');
          link.rel = rel;
          link.href = href;
          if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
              try { link.setAttribute(k, v); } catch {}
            }
          }
          head.appendChild(link);
        } catch {}
      };

      if (walletOrigin) {
        // Reduce DNS/TLS handshake and fetch delays for the wallet origin
        ensureLink('dns-prefetch', walletOrigin);
        ensureLink('preconnect', walletOrigin, { crossorigin: '' });

        // Prefetch the service HTML document only in same‑origin dev.
        // Cross‑origin prefetch would require ACAO on the HTML, which we purposely avoid.
        if (!isCrossOrigin) {
          try {
            const serviceUrl = new URL(servicePath, walletOrigin).toString();
            ensureLink('prefetch', serviceUrl, { as: 'document' });
          } catch {}
        }

        // Preload the wallet host script module so the iframe boots faster
        // Ensure the base URL ends with a trailing slash; otherwise new URL('file', base)
        // would replace the last path segment ("/sdk") and yield "/wallet-iframe-host.js".
        try {
          const sdkPath = (sdkBasePath || '/sdk') as string;
          const withSlash = sdkPath.endsWith('/') ? sdkPath : sdkPath + '/';
          const base = new URL(withSlash, walletOrigin);
          const hostJs = new URL('wallet-iframe-host.js', base).toString();
          ensureLink('modulepreload', hostJs, { crossorigin: '' });

          // Optionally preload WASM binaries to accelerate first-use
          // Requires CORS + correct MIME (application/wasm) on the wallet origin
          try {
            const signerWasm = new URL('workers/wasm_signer_worker_bg.wasm', base).toString();
            ensureLink('preload', signerWasm, { as: 'fetch', crossorigin: '', type: 'application/wasm' } as any);
          } catch {}
          try {
            const vrfWasm = new URL('workers/wasm_vrf_worker_bg.wasm', base).toString();
            ensureLink('preload', vrfWasm, { as: 'fetch', crossorigin: '', type: 'application/wasm' } as any);
          } catch {}

          // // Preload core CSS used by confirmer to reduce first-paint FOUC
          // const tokensCss = new URL('w3a-components.css', base).toString();
          // const txTreeCss = new URL('tx-tree.css', base).toString();
          // const modalCss = new URL('modal-confirmer.css', base).toString();
          // const drawerCss = new URL('drawer.css', base).toString();
          // ensureLink('preload', tokensCss, { as: 'style', crossorigin: '' });
          // ensureLink('preload', txTreeCss, { as: 'style', crossorigin: '' });
          // ensureLink('preload', modalCss, { as: 'style', crossorigin: '' });
          // ensureLink('preload', drawerCss, { as: 'style', crossorigin: '' });
        } catch {}
      }

      if (relayerUrl) {
        ensureLink('dns-prefetch', relayerUrl);
        ensureLink('preconnect', relayerUrl, { crossorigin: '' });
      }
    } catch {}
  }, [walletOrigin, servicePath, sdkBasePath, relayerUrl]);
}

export default usePreconnectWalletAssets;
