import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { PasskeyProvider } from '@web3authn/passkey/react';
import '@web3authn/passkey/react/styles';

import { HomePage } from './pages/HomePage';
import { Navbar } from './components/Navbar';
import './index.css';

// Simple App component to manage layout and potentially shared state later
function App() {
  return (
    <BrowserRouter>
      <PasskeyProvider
        config={{
          nearRpcUrl: 'https://rpc.testnet.near.org',
          // nearRpcUrl: 'https://test.rpc.fastnear.com',
          contractId: 'web3-authn-v4.testnet',
          nearNetwork: 'testnet',
          nearExplorerUrl: 'https://testnet.nearblocks.io',
          relayer: {
            accountId: 'web3-authn-v4.testnet',
            url: 'http://localhost:3000',
            initialUseRelayer: true,
          },
        }}
      >
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#222222',
              color: '#ffffff', // Default white text
            },
            success: {
              style: {
                background: '#222222',
                color: '#eaeaea',
              },
              iconTheme: {
                primary: '#4ade80', // Bright green
                secondary: '#222222',
              },
            },
            error: {
              style: {
                background: '#222222',
                color: '#eaeaea',
              },
              iconTheme: {
                primary: '#f87171', // Bright red
                secondary: '#222222',
              },
            },
            loading: {
              style: {
                background: '#222222',
                color: '#eaeaea',
              },
              iconTheme: {
                primary: '#60a5fa', // Bright blue
                secondary: '#222222',
              },
            },
          }}
        />
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </PasskeyProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
