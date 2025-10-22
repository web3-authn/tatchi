import React from 'react';
import type { PasskeyContextProviderProps } from '../types';

// Internal: Add preconnect/prefetch hints for wallet service + relayer.
// Not exported from the public react index; used by TatchiPasskeyProvider only.
export function usePreconnectWalletAssets(config: PasskeyContextProviderProps['config']): void {
  // Derive stable primitives to avoid re-running the effect on object identity changes.
  const walletOrigin = config?.iframeWallet?.walletOrigin as string | undefined;
  const servicePath = config?.iframeWallet?.walletServicePath || '/service';
  const sdkBasePath = config?.iframeWallet?.sdkBasePath || '/sdk';
  const relayerUrl = config?.relayer?.url as string | undefined;

  React.useEffect(() => {
    try {
      if (typeof document === 'undefined') return;
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

        // Prefetch the service HTML document
        try {
          const serviceUrl = new URL(servicePath, walletOrigin).toString();
          ensureLink('prefetch', serviceUrl, { as: 'document', crossorigin: '' });
        } catch {}

        // Preload the wallet host script module so the iframe boots faster
        // Ensure the base URL ends with a trailing slash; otherwise new URL('file', base)
        // would replace the last path segment ("/sdk") and yield "/wallet-iframe-host.js".
        try {
          const sdkPath = (sdkBasePath || '/sdk') as string;
          const withSlash = sdkPath.endsWith('/') ? sdkPath : sdkPath + '/';
          const base = new URL(withSlash, walletOrigin);
          const hostJs = new URL('wallet-iframe-host.js', base).toString();
          ensureLink('modulepreload', hostJs, { crossorigin: '' });
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
