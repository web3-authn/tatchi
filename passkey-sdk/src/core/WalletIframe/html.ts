// Helper to generate a minimal wallet service HTML. This allows hosting
// a service page at `${walletOrigin}${servicePath}` without copying files.
// Serve the returned string as text/html from your server route.

import { sanitizeSdkBasePath, escapeHtmlAttribute } from './sanitization';

export function getWalletServiceHtml(sdkBasePath: string = '/sdk'): string {
  const sanitizedBasePath = sanitizeSdkBasePath(sdkBasePath);
  // Embedded bundles are exposed under `${sdkBasePath}/esm/react/embedded/*`
  const serviceHostPath = `${sanitizedBasePath}/esm/react/embedded/wallet-iframe-host.js`;
  const escapedPath = escapeHtmlAttribute(serviceHostPath);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Web3Authn Wallet Service</title>
  </head>
  <body>
    <script type="module" src="${escapedPath}"></script>
  </body>
</html>`;
}
