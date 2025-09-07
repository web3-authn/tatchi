import { useState, useRef } from 'react'
import { usePasskeyContext, RegistrationPhase, RegistrationStatus, LoginPhase, SignupMenu } from '@web3authn/passkey/react'
import toast from 'react-hot-toast'

import {
  type RegistrationSSEEvent,
  AccountRecoveryPhase,
  AccountRecoveryStatus
} from '@web3authn/passkey/react'

import { GlassBorder } from './GlassBorder'
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

  const [isSecureContext] = useState(() => window.isSecureContext);


  const onRegister = async () => {
    if (!targetAccountId) return;
    try {
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
      }
    } catch (error: any) {
      console.error('Registration error:', error);
    }
  };

  const onRecover = async () => {
    if (!targetAccountId) return;
    try {
      const flow = startAccountRecoveryFlow({
        onEvent: async (event) => {
          if (
            event.phase === AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE
            && event.status === AccountRecoveryStatus.SUCCESS
          ) {
            await refreshLoginState(targetAccountId);
          }
        },
        onError: (error) => console.error('Recovery error:', error)
      });

      const options = await flow.discover(targetAccountId);
      const result = await flow.recover(options[0]);

      if (result.success) {
        toast.success(`Account ${targetAccountId} recovered successfully!`);
      } else {
        toast.error(`Recovery failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Recovery error:', error);
      toast.error(`Recovery failed: ${error.message}`);
    }
  };

  const onLogin = async () => {
    if (!targetAccountId) return;

    await loginPasskey(targetAccountId, {
      onEvent: (event) => {
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
      display: 'grid',
      placeItems: 'center',
      minHeight: '60vh'
    }}>
      <SignupMenu
        title="Passkey Login"
        defaultMode={accountExists ? 'login' : 'register'}
        socialLogin={["google", "apple", "github"]}
        // socialLogin={[]}
        userInput={inputUsername}
        onUserInputChange={setInputUsername}
        postfixText={displayPostfix}
        isUsingExistingAccount={isUsingExistingAccount}
        accountExists={accountExists}
        isSecureContext={isSecureContext}
        onBeginPasskeyLogin={(mode) => {
          if (!targetAccountId) return;
          if (mode === 'login') onLogin();
          else onRegister();
        }}
        onBeginAccountRecovery={() => {
          if (!targetAccountId) return;
          onRecover();
        }}
        showQRCodeSection={true}
      />
    </div>
  );
}
