import { useState, useRef } from 'react'
import { usePasskeyContext, RegistrationPhase, RegistrationStatus, LoginPhase, PasskeyAuthMenu } from '@web3authn/passkey/react'
import toast from 'react-hot-toast'

import {
  type RegistrationSSEEvent,
  AccountRecoveryPhase,
  AccountRecoveryStatus
} from '@web3authn/passkey/react'
import './PasskeyLoginMenu.css'


export function PasskeyLoginMenu() {
  const {
    loginState: {
      isLoggedIn,
      nearPublicKey,
      nearAccountId
    },
    accountInputState: {
      inputUsername,
      targetAccountId,
      displayPostfix,
      isUsingExistingAccount,
      accountExists
    },
    loginPasskey,
    registerPasskey,
    startAccountRecoveryFlow,
    refreshLoginState,
    // UI
    setInputUsername,
    passkeyManager,
    useRelayer,
    toggleRelayer,
  } = usePasskeyContext();

  const onRegister = async () => {
    const result = await registerPasskey(targetAccountId, {
      useRelayer: useRelayer,
      onEvent: (event: RegistrationSSEEvent) => {
        switch (event.phase) {
          case RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION:
            if (event.status === RegistrationStatus.PROGRESS) {
              toast.loading('Starting registration...', { id: 'registration' });
            }
            break;
          case RegistrationPhase.STEP_2_KEY_GENERATION:
            if (event.status === RegistrationStatus.SUCCESS) {
              toast.success(`Keys generated...`, { id: 'registration' });
            }
            break;
          case RegistrationPhase.STEP_3_ACCESS_KEY_ADDITION:
            if (event.status === RegistrationStatus.PROGRESS) {
              toast.loading(`Creating account...`, { id: 'registration' });
            }
            break;
          case RegistrationPhase.STEP_6_CONTRACT_REGISTRATION:
            if (event.status === RegistrationStatus.PROGRESS) {
              toast.loading(`Registering with Web3Authn contract...`, { id: 'registration' });
            }
            break;
          case RegistrationPhase.STEP_7_REGISTRATION_COMPLETE:
            if (event.status === RegistrationStatus.SUCCESS) {
              toast.success('Registration completed successfully!', { id: 'registration' });
            }
            break;
          case RegistrationPhase.REGISTRATION_ERROR:
            toast.error(event.error || 'Registration failed', { id: 'registration' });
            break;
          default:
            if (event.status === RegistrationStatus.PROGRESS) {
              toast.loading(event.message || 'Processing...', { id: 'registration' });
            }
        }
      },
    });

    if (result.success && result.nearAccountId) {
      // Registration successful - the context will handle updating account data
      return; // success: resolve
    }
    // Ensure failure propagates to caller so UI can reset
    throw new Error(result.error || 'Registration failed');
  };

  const onRecover = async () => {
    const flow = startAccountRecoveryFlow({
      onEvent: async (event) => {
        if (
          event.phase === AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE
          && event.status === AccountRecoveryStatus.SUCCESS
        ) {
          await refreshLoginState(targetAccountId);
        }
      },
      onError: (error) => {
        console.error('Recovery error:', error)
        toast.error(`Recovery failed: ${error.message}`);
      }
    });

    const options = await flow.discover(targetAccountId);
    try {
      const result = await flow.recover(options[0]);
      if (result.success) {
        toast.success(`Account ${targetAccountId} recovered successfully!`);
        return; // success
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Recovery error:', err);
      // Keep toast consistent
      toast.error(`Recovery failed: ${err?.message || String(err)}`);
      // Re-throw so PasskeyAuthMenu can reset UI back to sign-in
      throw err;
    }
  };

  const onLogin = async () => {
    // Return the promise so caller can await and catch
    return loginPasskey(targetAccountId, {
      onEvent: (event) => {
        console.log("LOGIN EVENT:", event);
        switch (event.phase) {
          case LoginPhase.STEP_1_PREPARATION:
            toast.loading(`Logging in as ${targetAccountId}...`, { id: 'login' });
            break;
          case LoginPhase.STEP_2_WEBAUTHN_ASSERTION:
            toast.loading(event.message, { id: 'login' });
            break;
          case LoginPhase.STEP_3_VRF_UNLOCK:
            break;
          case LoginPhase.STEP_4_LOGIN_COMPLETE:
            toast.success(`Logged in as ${event.nearAccountId}!`, { id: 'login' });
            break;
          case LoginPhase.LOGIN_ERROR:
            toast.error(event.error, { id: 'login' });
            break;
        }
      }
    });
  };

  return (
    <div className="passkey-login-container-root" style={{
    }}>
      <PasskeyAuthMenu
        defaultMode={accountExists ? 'login' : 'register'}
        socialLogin={{}}
        // socialLogin={{
        //   google: () => 'username is: <gmail_email@gmail>',
        //   x: () => 'username is <twitter_handle@x>',
        //   apple: () => 'username is <email@apple>'
        // }}
        onLogin={async () => {
          if (!targetAccountId) throw new Error('Missing account id');
          return onLogin();
        }}
        onRegister={async () => {
          if (!targetAccountId) throw new Error('Missing account id');
          return onRegister();
        }}
        onRecoverAccount={async () => {
          if (!targetAccountId) throw new Error('Missing account id');
          return onRecover();
        }}
      />
    </div>
  );
}
