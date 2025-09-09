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

// Simple App component to manage layout and potentially shared state later
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PasskeyProvider
          config={{
            nearRpcUrl: 'https://rpc.testnet.near.org',
            // nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'web3-authn-v5.testnet',
            nearNetwork: 'testnet',
            nearExplorerUrl: 'https://testnet.nearblocks.io',
            // Route sensitive flows via cross-origin wallet service
            // Route via Caddy reverse proxy (TLS provided by Caddy)
            walletOrigin: 'https://wallet.example.localhost',
            walletServicePath: '/wallet-service',
            walletTheme: 'dark',
            // Force a single rpId across parent + wallet origins so passkeys are usable on both
            rpIdOverride: 'example.localhost',
            relayer: {
              accountId: 'web3-authn-v5.testnet',
              url: 'https://relay-server.localhost',
            },
          }}
        >
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
