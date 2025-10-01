import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { PasskeyProvider, ThemeProvider } from '@web3authn/passkey/react';
import '@web3authn/passkey/react/styles';

import { HomePage } from './pages/HomePage';
import { EmbeddedTxConfirmPage } from './pages/EmbeddedTxConfirmPage';
import { MultiTxConfirmPage } from './pages/MultiTxConfirmPage';
import { Navbar } from './components/Navbar';
import './index.css';
import { ToasterThemed } from './components/ToasterThemed';

// Read env vars (Vite requires using import.meta.env exactly)
// Note: Vite requires using `import.meta.env` exactly; optional chaining breaks env injection.
const env: any = import.meta.env;
const RELAYER_URL = env.VITE_RELAYER_URL as any;
const RELAYER_ACCOUNT_ID = env.VITE_RELAYER_ACCOUNT_ID as any;
const WALLET_ORIGIN = env.VITE_WALLET_ORIGIN as any;
const WALLET_SERVICE_PATH = env.VITE_WALLET_SERVICE_PATH as any;
const RP_ID_BASE = env.VITE_RP_ID_BASE as any;

// Simple App component to manage layout and potentially shared state later
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PasskeyProvider
          config={{
            relayer: {
              url: RELAYER_URL,
              accountId: RELAYER_ACCOUNT_ID,
            },
            iframeWallet: {
              walletOrigin: WALLET_ORIGIN,
              walletServicePath: WALLET_SERVICE_PATH,
              rpIdOverride: RP_ID_BASE,
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
