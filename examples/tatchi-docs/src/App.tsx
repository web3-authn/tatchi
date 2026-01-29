import React from 'react';
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider';

import { HomePage } from './pages/HomePage';
import { ToasterThemed } from './components/ToasterThemed';
import { useVitepressTheme } from './hooks/useVitepressTheme';
import { useBodyLoginStateBridge } from './hooks/useBodyLoginStateBridge';
import { useExportKeyCancelToast } from './hooks/useExportKeyCancelToast';

export const App: React.FC = () => {
  const env = import.meta.env;
  const { theme, setTheme } = useVitepressTheme();

  const VitepressStateSync: React.FC = () => {
    useBodyLoginStateBridge();
    useExportKeyCancelToast();
    return null;
  };

  return (
    <TatchiPasskeyProvider
      theme={{ theme, setTheme }}
      config={{
        iframeWallet: {
          walletOrigin: env.VITE_WALLET_ORIGIN,
          walletServicePath: env.VITE_WALLET_SERVICE_PATH,
          rpIdOverride: env.VITE_RP_ID_BASE,
          sdkBasePath: env.VITE_SDK_BASE_PATH,
        },
        contractId: env.VITE_WEBAUTHN_CONTRACT_ID,
        nearRpcUrl: env.VITE_NEAR_RPC_UR,
        nearExplorerUrl: env.VITE_NEAR_EXPLORER,
        // Demo default: use threshold signing, but fallback to local signer if unavailable
        signerMode: {
          mode: 'threshold-signer',
          behavior: 'fallback'
        },
        relayer: {
          url: env.VITE_RELAYER_URL!,
        },
        vrfWorkerConfigs: {
          shamir3pass: {
            relayServerUrl: env.VITE_RELAYER_URL!,
          },
        },
      }}
    >
      <HomePage />
      <VitepressStateSync />
      <ToasterThemed />
    </TatchiPasskeyProvider>
  );
};

export default App;
