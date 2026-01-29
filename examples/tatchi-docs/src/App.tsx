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

  React.useEffect(() => {
    const out = {
      VITE_NEAR_NETWORK: env.VITE_NEAR_NETWORK,
      VITE_WEBAUTHN_CONTRACT_ID: env.VITE_WEBAUTHN_CONTRACT_ID,
      VITE_NEAR_RPC_URL: env.VITE_NEAR_RPC_URL,
      VITE_NEAR_EXPLORER: env.VITE_NEAR_EXPLORER,
      VITE_RELAYER_URL: env.VITE_RELAYER_URL,
      VITE_RELAYER_ACCOUNT_ID: env.VITE_RELAYER_ACCOUNT_ID,
      VITE_WALLET_ORIGIN: env.VITE_WALLET_ORIGIN,
      VITE_WALLET_SERVICE_PATH: env.VITE_WALLET_SERVICE_PATH,
      VITE_SDK_BASE_PATH: env.VITE_SDK_BASE_PATH,
      VITE_RP_ID_BASE: env.VITE_RP_ID_BASE,
      VITE_RECOVER_EMAIL_RECIPIENT: env.VITE_RECOVER_EMAIL_RECIPIENT,
      VITE_EMAIL_RECOVERER_GLOBAL_CONTRACT: env.VITE_EMAIL_RECOVERER_GLOBAL_CONTRACT,
      VITE_ZK_EMAIL_VERIFIER_CONTRACT: env.VITE_ZK_EMAIL_VERIFIER_CONTRACT,
      VITE_EMAIL_DKIM_VERIFIER_CONTRACT: env.VITE_EMAIL_DKIM_VERIFIER_CONTRACT,
    };
    console.info('[tatchi-docs] runtime env', out);
  }, []);

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
        nearNetwork: env.VITE_NEAR_NETWORK,
        contractId: env.VITE_WEBAUTHN_CONTRACT_ID,
        nearRpcUrl: env.VITE_NEAR_RPC_URL,
        nearExplorerUrl: env.VITE_NEAR_EXPLORER,
        // Demo default: use threshold signing, but fallback to local signer if unavailable
        signerMode: {
          mode: 'threshold-signer',
          behavior: 'fallback'
        },
        relayer: {
          url: env.VITE_RELAYER_URL!,
          emailRecovery: {
            mailtoAddress: env.VITE_RECOVER_EMAIL_RECIPIENT,
          },
        },
        emailRecoveryContracts: {
          emailRecovererGlobalContract: env.VITE_EMAIL_RECOVERER_GLOBAL_CONTRACT,
          zkEmailVerifierContract: env.VITE_ZK_EMAIL_VERIFIER_CONTRACT,
          emailDkimVerifierContract: env.VITE_EMAIL_DKIM_VERIFIER_CONTRACT,
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
