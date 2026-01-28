import React from 'react';
import ReactDOM from 'react-dom/client';

import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider';
import '@tatchi-xyz/sdk/react/styles';

import { HomePage } from './pages/HomePage';
import { ToasterThemed } from './components/ToasterThemed';
import { useDocumentTheme } from './hooks/useDocumentTheme';
import './index.css';
import { parseWalletOrigins, readUseExtensionWalletPreference } from './walletRouting';

// Note: Vite requires using `import.meta.env` exactly; optional chaining breaks env injection.
const env = import.meta.env;
const relayerUrl = env.VITE_RELAYER_URL!;
const sdkBasePath = env.VITE_SDK_BASE_PATH || '/sdk';

const walletOrigins = parseWalletOrigins(env.VITE_WALLET_ORIGIN);
const preferredExtension = readUseExtensionWalletPreference();
const selectedWalletOrigin =
  (preferredExtension && walletOrigins.extensionWalletOrigin)
    ? walletOrigins.extensionWalletOrigin
    : (walletOrigins.webWalletOrigin ?? walletOrigins.extensionWalletOrigin);
const usingExtensionWallet = !!selectedWalletOrigin && selectedWalletOrigin.startsWith('chrome-extension://');
const walletServicePath = usingExtensionWallet
  ? '/wallet-service.html'
  : (env.VITE_WALLET_SERVICE_PATH || '/wallet-service');
const rpIdOverride = usingExtensionWallet ? undefined : env.VITE_RP_ID_BASE;

function App() {
  const { theme, setTheme } = useDocumentTheme();

  return (
    <TatchiPasskeyProvider
      theme={{ theme, setTheme }}
      config={{
        relayer: {
          url: relayerUrl,
        },
        iframeWallet: {
          walletOrigin: selectedWalletOrigin,
          walletServicePath,
          rpIdOverride,
          sdkBasePath,
        },
      }}
    >
      <HomePage/>
      <ToasterThemed />
    </TatchiPasskeyProvider>
  );
}

const appRoot = document.getElementById('app-root');

if (appRoot) {
  ReactDOM.createRoot(appRoot).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
