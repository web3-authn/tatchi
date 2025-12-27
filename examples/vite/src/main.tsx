import React from 'react';
import ReactDOM from 'react-dom/client';

import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider';
import '@tatchi-xyz/sdk/react/styles';

import { HomePage } from './pages/HomePage';
import { ToasterThemed } from './components/ToasterThemed';
import './index.css';

// Note: Vite requires using `import.meta.env` exactly; optional chaining breaks env injection.
const env = import.meta.env;
const relayerUrl = env.VITE_RELAYER_URL!;
const walletOrigin = env.VITE_WALLET_ORIGIN;
const walletServicePath = env.VITE_WALLET_SERVICE_PATH || '/wallet-service';
const sdkBasePath = env.VITE_SDK_BASE_PATH || '/sdk';

function App() {
  return (
    <TatchiPasskeyProvider
      config={{
        relayer: {
          url: relayerUrl,
        },
        iframeWallet: {
          walletOrigin,
          walletServicePath,
          rpIdOverride: env.VITE_RP_ID_BASE,
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
