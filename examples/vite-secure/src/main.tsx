import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { PasskeyProvider, ThemeProvider } from '@web3authn/passkey/react';
import '@web3authn/passkey/react/styles';

import { HomePage } from './pages/HomePage';
import { EmbeddedTxConfirmPage } from './pages/EmbeddedTxConfirmPage';
import { ModalTxConfirmPage } from './pages/ModalTxConfirmPage';
import { WalletIframeDemoPage } from './pages/WalletIframeDemoPage';
import { Navbar } from './components/Navbar';
import './index.css';
import { ToasterThemed } from './components/ToasterThemed';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@web3authn/passkey/react';

// Read optional wallet iframe envs to toggle cross-origin mode
const env: any = (import.meta as any)?.env || {};
// Dev fallback: if not provided via Vite env, assume our Caddy dev origin
const WALLET_ORIGIN: string | undefined = env?.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost';
const WALLET_SERVICE_PATH: string = env?.VITE_WALLET_SERVICE_PATH || '/wallet-service';
try { console.log('[vite-secure] WALLET_ORIGIN =', WALLET_ORIGIN, 'WALLET_SERVICE_PATH =', WALLET_SERVICE_PATH); } catch {}
// Enable verbose SDK logs via ?debug=1
try { if (typeof window !== 'undefined' && window.location?.search?.includes('debug=1')) { (window as any).__W3A_DEBUG__ = true; } } catch {}

// Simple App component to manage layout and potentially shared state later
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PasskeyProvider config={{
          ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
          ...(WALLET_ORIGIN ? {
            iframeWallet: {
              walletOrigin: WALLET_ORIGIN,
              walletServicePath: WALLET_SERVICE_PATH,
              // Optional: set RP ID base so passkeys work across local subpaths/origins
              rpIdOverride: 'example.localhost',
            },
          } : {}),
        }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/embedded" element={<EmbeddedTxConfirmPage/>} />
          <Route path="/modal" element={<ModalTxConfirmPage/>} />
          <Route path="/wallet-demo" element={<WalletIframeDemoPage/>} />
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
