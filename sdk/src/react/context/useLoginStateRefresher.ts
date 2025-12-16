import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TatchiPasskey } from '@/core/TatchiPasskey';
import type { WalletIframeRouter } from '@/core/WalletIframe/client/router';
import { toAccountId } from '@/core/types/accountIds';
import type { LoginState, TatchiContextType } from '../types';

export function useLoginStateRefresher(args: {
  tatchi: TatchiPasskey;
  walletIframeConnected: boolean;
  walletIframeClientRef: MutableRefObject<WalletIframeRouter | null>;
  setLoginState: Dispatch<SetStateAction<LoginState>>;
}) {
  const { tatchi, walletIframeConnected, walletIframeClientRef, setLoginState } = args;

  const refreshLoginState: TatchiContextType['refreshLoginState'] = useCallback(async (nearAccountId?: string) => {
    try {
      const walletClient = walletIframeClientRef.current;
      if (walletIframeConnected && walletClient) {
        try {
          const { login: st } = await walletClient.getLoginSession();
          if (st?.vrfActive && st?.nearAccountId) {
            setLoginState(prevState => ({
              ...prevState,
              nearAccountId: st.nearAccountId,
              nearPublicKey: st.publicKey || null,
              isLoggedIn: true,
            }));
            return;
          }
        } catch {}
      }

      const { login: ls } = await tatchi.getLoginSession(nearAccountId);
      if (ls.nearAccountId && ls.vrfActive) {
        try { tatchi.userPreferences.setCurrentUser(toAccountId(ls.nearAccountId)); } catch {}
        setLoginState(prevState => ({
          ...prevState,
          nearAccountId: ls.nearAccountId,
          nearPublicKey: ls.publicKey || null,
          isLoggedIn: true,
        }));
      } else {
        setLoginState(prevState => ({
          ...prevState,
          nearAccountId: null,
          nearPublicKey: null,
          isLoggedIn: false,
        }));
      }
    } catch (error) {
      console.error('Error refreshing login state:', error);
    }
  }, [setLoginState, tatchi, walletIframeClientRef, walletIframeConnected]);

  useEffect(() => {
    void refreshLoginState();
  }, [refreshLoginState]);

  return refreshLoginState;
}

