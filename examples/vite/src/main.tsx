import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { TatchiPasskeyProvider, useTheme } from '@tatchi/sdk/react';
import '@tatchi/sdk/react/styles';

import { HomePage } from './pages/HomePage';
import { MultiTxConfirmPage } from './pages/MultiTxConfirmPage';
import { Navbar } from './components/Navbar';
import { ToasterThemed } from './components/ToasterThemed';
import './index.css';

// Note: Vite requires using `import.meta.env` exactly; optional chaining breaks env injection.
const env = import.meta.env;

function App() {
  // Mirror theme onto <body> so overscroll shows correct background
  const BodyThemeSync: React.FC = () => {
    const { theme } = useTheme();
    React.useEffect(() => {
      try { document.body.setAttribute('data-w3a-theme', theme); } catch {}
    }, [theme]);
    return null;
  };

  return (
    <BrowserRouter>
      <TatchiPasskeyProvider
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
              // Safari: allow GET fallback bridging when iframe doc loses focus or ancestor restrictions apply
              enableSafariGetWebauthnRegistrationFallback: true,
            },
          }}
        theme={{ as: 'div', className: 'w3a-theme-provider' }}
      >
        <BodyThemeSync />
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/multitx" element={<MultiTxConfirmPage/>} />
        </Routes>
        <ToasterThemed />
      </TatchiPasskeyProvider>
    </BrowserRouter>
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
