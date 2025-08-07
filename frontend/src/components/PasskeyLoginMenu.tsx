import { useState, useRef } from 'react'
import { usePasskeyContext, RegistrationPhase, RegistrationStatus, LoginPhase, LoginStatus, ActionPhase, ActionStatus } from '@web3authn/passkey/react'
import toast from 'react-hot-toast'

import {
  type RegistrationSSEEvent,
  AccountRecoveryPhase,
  AccountRecoveryStatus
} from '@web3authn/passkey/react'

import { Toggle } from './Toggle'
import { usePostfixPosition } from '../hooks/usePostfixPosition'
import { LinkDeviceShowQR } from './LinkDeviceShowQR'


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

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const postfixRef = useRef<HTMLSpanElement>(null);

  // Use the postfix positioning hook
  usePostfixPosition({
    inputRef: usernameInputRef,
    postfixRef: postfixRef,
    inputValue: inputUsername
  });

  const handleLocalUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputUsername(e.target.value);
  };

  const onRegister = async () => {
    if (!targetAccountId) {
      return;
    }

    console.log('Registering account:', targetAccountId);
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
          console.log('Recovery event:', event);
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
    if (!targetAccountId) {
      return;
    }

    console.log('Logging in with account:', targetAccountId);
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

  if (!isSecureContext) {
    return (
      <div className="passkey-container">
        <h3>Passkey Authentication</h3>
        <div className="security-warning">
          <p>⚠️ Passkey operations require a secure context (HTTPS or localhost).</p>
          <p>Please ensure your development server is running on HTTPS or access via localhost.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="passkey-container-root">
      <div className="passkey-container">

        <h2>Passkey Login</h2>
        <p className="caption">Authenticate onchain with Passkeys</p>

        <Toggle
          checked={useRelayer}
          onChange={toggleRelayer}
          label={useRelayer ? 'Use relayer' : 'Use faucet'}
          tooltip={useRelayer
            ? 'Using relayer for account creation'
            : 'Using faucet for account creation'
          }
          className="auth-mode-toggle"
          size="small"
          textPosition="left"
        />

        <>
          <div className="input-wrapper">
            <div className="username-input-container">
              <input
                ref={usernameInputRef}
                type="text"
                value={inputUsername}
                onChange={handleLocalUsernameChange}
                placeholder="Enter username for passkey"
                className="styled-input username-input"
              />
              <span
                ref={postfixRef}
                className={`account-postfix ${isUsingExistingAccount ? 'stored-account' : ''}`}
                title={isUsingExistingAccount ? 'Using existing account domain' : 'New account domain'}
              >
                {displayPostfix}
                {isUsingExistingAccount && <span className="stored-indicator">●</span>}
              </span>
            </div>
            {accountExists && inputUsername && (
              <div className="account-exists-badge">
                account exists
              </div>
            )}
          </div>


          <div className="auth-buttons">
            <button onClick={onRegister}
              className={`action-button ${!accountExists ? 'primary' : ''}`}
              disabled={!inputUsername || !isSecureContext || accountExists}>
              Register Passkey
            </button>
            <button onClick={onRecover}
              className={`action-button ${!accountExists ? 'primary' : ''}`}
              disabled={!inputUsername || !isSecureContext || accountExists}>
              Recover Account
            </button>
            <button onClick={onLogin}
              className={`action-button ${accountExists ? 'primary' : ''}`}
              disabled={!inputUsername || !accountExists}
            >
              Login with Passkey
            </button>
          </div>

          <LinkDeviceShowQR />
        </>
      </div>
    </div>
  );
}