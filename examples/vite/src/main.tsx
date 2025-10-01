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
const env: any = import.meta.env;
const RELAYER_URL = env.VITE_RELAYER_URL as any;
const RELAYER_ACCOUNT_ID = env.VITE_RELAYER_ACCOUNT_ID as any;

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PasskeyProvider config={{
          // Same-origin mode (App Wallet) for this example.
          // To demo cross-origin wallet hosting, use the vite-secure example
          // which serves the wallet service on a separate origin.
          relayer: {
            url: RELAYER_URL,
            accountId: RELAYER_ACCOUNT_ID,
          },
        }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/embedded" element={<EmbeddedTxConfirmPage/>} />
          <Route path="/modal" element={<MultiTxConfirmPage/>} />
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
