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

// Note: Vite requires using `import.meta.env` exactly; optional chaining breaks env injection.
const env = import.meta.env;

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PasskeyProvider config={{
          relayer: {
            url: env.RELAYER_URL,
            accountId: env.RELAYER_ACCOUNT_ID,
          },
          iframeWallet: {
            walletOrigin: env.WALLET_ORIGIN,
            walletServicePath: env.WALLET_SERVICE_PATH,
            rpIdOverride: env.RP_ID_BASE,
          }
        }}>
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
