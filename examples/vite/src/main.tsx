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

// Simple App component to manage layout and potentially shared state later
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PasskeyProvider config={{
          // // Same-origin mode (App Wallet) by default for this example.
          // // To demo cross-origin wallet hosting, use the vite-secure example
          // // which serves the wallet service on a separate origin.
          // ...PASSKEY_MANAGER_DEFAULT_CONFIGS,

          // To demo cross-origin wallet hosting, use the vite-secure example
          // which serves the wallet service on a separate origin.
          ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
          // Enable Wallet-in-Iframe mode for local dev
          iframeWallet: {
            walletOrigin: 'https://wallet.example.localhost',
            walletServicePath: '/wallet-service',
            // Optional: set RP ID base so passkeys work across local subpaths/origins
            rpIdOverride: 'example.localhost',
          },
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
