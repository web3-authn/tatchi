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
  const nearNetwork = (env.VITE_NEAR_NETWORK || '').toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet';
  const nearRpcUrlDefault = nearNetwork === 'mainnet' ? 'https://rpc.fastnear.com' : 'https://test.rpc.fastnear.com';
  const nearExplorerUrlDefault = nearNetwork === 'mainnet' ? 'https://nearblocks.io' : 'https://testnet.nearblocks.io';
  const webAuthnContractIdDefault = nearNetwork === 'mainnet' ? 'w3a-v1.near' : 'w3a-v1.testnet';

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
        nearNetwork,
        contractId: env.VITE_WEBAUTHN_CONTRACT_ID || webAuthnContractIdDefault,
        nearRpcUrl: env.VITE_NEAR_RPC_URL || nearRpcUrlDefault,
        nearExplorerUrl: env.VITE_NEAR_EXPLORER || nearExplorerUrlDefault,
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
