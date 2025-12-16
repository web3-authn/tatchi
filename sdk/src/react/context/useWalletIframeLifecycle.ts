import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TatchiPasskey } from '@/core/TatchiPasskey';
import type { WalletIframeRouter } from '@/core/WalletIframe/client/router';
import { toAccountId } from '@/core/types/accountIds';
import type { LoginState } from '../types';

export function useWalletIframeLifecycle(args: {
  tatchi: TatchiPasskey;
  walletIframeClientRef: MutableRefObject<WalletIframeRouter | null>;
  setWalletIframeConnected: Dispatch<SetStateAction<boolean>>;
  setLoginState: Dispatch<SetStateAction<LoginState>>;
}) {
  const {
    tatchi,
    walletIframeClientRef,
    setWalletIframeConnected,
    setLoginState,
  } = args;

  useEffect(() => {
    let offReady: (() => void) | undefined;
    let offVrf: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const useIframe = !!tatchi.configs.iframeWallet?.walletOrigin;
        if (!useIframe) {
          setWalletIframeConnected(false);
          return;
        }

        await tatchi.initWalletIframe();
        const client = tatchi.getWalletIframeClient?.();
        if (!client) {
          setWalletIframeConnected(false);
          return;
        }
        if (cancelled) return;

        setWalletIframeConnected(client.isReady());
        offReady = client.onReady?.(() => setWalletIframeConnected(true));

        offVrf = client.onVrfStatusChanged?.(async (status: { active: boolean; nearAccountId: string | null; sessionDuration?: number }) => {
          if (cancelled) return;
          if (status?.active && status?.nearAccountId) {
            const { login: state } = await client.getLoginSession(status.nearAccountId);
            tatchi.userPreferences.setCurrentUser(toAccountId(status.nearAccountId));
            setLoginState(prev => ({
              ...prev,
              isLoggedIn: true,
              nearAccountId: status.nearAccountId,
              nearPublicKey: state.publicKey || null,
            }));
          } else if (status && status.active === false) {
            setLoginState(prev => ({
              ...prev,
              isLoggedIn: false,
              nearAccountId: null,
              nearPublicKey: null,
            }));
          }
        });

        const { login: st } = await client.getLoginSession();
        if (st?.vrfActive && st?.nearAccountId) {
          setLoginState(prev => ({
            ...prev,
            isLoggedIn: true,
            nearAccountId: st.nearAccountId,
            nearPublicKey: st.publicKey || null,
          }));
        }

        walletIframeClientRef.current = client;
      } catch (err) {
        console.warn('[TatchiContextProvider] WalletIframe init failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      offReady && offReady();
      offVrf && offVrf();
      walletIframeClientRef.current = null;
    };
  }, [setLoginState, setWalletIframeConnected, tatchi, walletIframeClientRef]);
}

