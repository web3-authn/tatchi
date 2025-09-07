import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { PasskeyProvider, ThemeProvider } from '@web3authn/passkey/react';
import '@web3authn/passkey/react/styles';

import { HomePage } from './pages/HomePage';
import { EmbeddedTxConfirmPage } from './pages/EmbeddedTxConfirmPage';
import { ModalTxConfirmPage } from './pages/ModalTxConfirmPage';
import { Navbar } from './components/Navbar';
import './index.css';

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
            relayer: {
              accountId: 'web3-authn-v5.testnet',
              url: 'http://localhost:3000',
              initialUseRelayer: true,
            },
          }}
        >
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/embedded" element={<EmbeddedTxConfirmPage/>} />
          <Route path="/modal" element={<ModalTxConfirmPage/>} />
        </Routes>

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
