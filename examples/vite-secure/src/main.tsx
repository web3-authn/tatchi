import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { PasskeyProvider, ThemeProvider, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@web3authn/passkey/react';
import '@web3authn/passkey/react/styles';

import { HomePage } from './pages/HomePage';
import { EmbeddedTxConfirmPage } from './pages/EmbeddedTxConfirmPage';
import { MultiTxConfirmPage } from './pages/MultiTxConfirmPage';
import { Navbar } from './components/Navbar';
import './index.css';
import { ToasterThemed } from './components/ToasterThemed';

// Note: Vite requires using `import.meta.env` exactly; optional chaining breaks env injection.
const env = import.meta.env;

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PasskeyProvider
          config={{
            relayer: {
              url: env.VITE_RELAYER_URL!,
              accountId: env.VITE_RELAYER_ACCOUNT_ID!,
            },
            vrfWorkerConfigs: {
              shamir3pass: {
                relayServerUrl: env.VITE_RELAYER_URL!,
              }
            },
            iframeWallet: {
              walletOrigin: env.VITE_WALLET_ORIGIN,
              walletServicePath: env.VITE_WALLET_SERVICE_PATH,
              rpIdOverride: env.VITE_RP_ID_BASE,
              // Align dev with production asset layout
              sdkBasePath: env.VITE_SDK_BASE_PATH,
            },
          }}
        >
          <Navbar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/embedded" element={<EmbeddedTxConfirmPage/>} />
            <Route path="/multitx" element={<MultiTxConfirmPage/>} />
          </Routes>
          <ToasterThemed />
        </PasskeyProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
