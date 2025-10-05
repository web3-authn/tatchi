import {
  usePasskeyContext,
  RegistrationPhase,
  RegistrationStatus,
  LoginPhase,
  PasskeyAuthMenu,
  AuthMenuMode,
  DeviceLinkingPhase,
  DeviceLinkingStatus
} from '@web3authn/passkey/react'
import toast from 'react-hot-toast'

import {
  type RegistrationSSEEvent,
  AccountRecoveryPhase,
  AccountRecoveryStatus,
  type DeviceLinkingSSEEvent
} from '@web3authn/passkey/react'
import './PasskeyLoginMenu.css'

function friendlyWebAuthnMessage(err: any): string {
  const msg = err?.message || String(err || 'Unknown error');
  const name = err?.name || '';

  const notAllowed = name === 'NotAllowedError' || /NotAllowedError/i.test(msg) || /timed out or was not allowed/i.test(msg);
  if (notAllowed) return 'Touch ID was cancelled or timed out.';

  if (name === 'AbortError' || /AbortError/i.test(msg)) return 'Authentication was cancelled.';
  if (name === 'TimeoutError' || /timed out/i.test(msg)) return 'Touch ID timed out. Please try again.';
  if (name === 'SecurityError' || /SecurityError/i.test(msg)) return 'Security error. Make sure you are on a secure site (HTTPS).';
  if (name === 'InvalidStateError' || /InvalidStateError/i.test(msg)) return 'No matching passkey found for this account.';

  return msg.startsWith('Recovery failed:') ? msg : `Recovery failed: ${msg}`;
}


export function PasskeyLoginMenu() {
  const {
    loginState,
    accountInputState: {
      inputUsername,
      targetAccountId,
      displayPostfix,
      isUsingExistingAccount,
      accountExists
    },
    loginPasskey,
    registerPasskey,
    refreshLoginState,
    // UI
    setInputUsername,
    passkeyManager,
  } = usePasskeyContext();

  const onRegister = async () => {
    const result = await registerPasskey(targetAccountId, {
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
              // Final toast with tx hash will be shown after the promise resolves
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
      // Registration successful – replace with final toast including tx hash
      const tx = result.transactionId ? ` (tx: ${result.transactionId})` : '';
      toast.success(`Registration completed successfully${tx}`, { id: 'registration' });
      return; // success: resolve
    }
    // Ensure failure propagates to caller so UI can reset
    throw new Error(result.error || 'Registration failed');
  };

  const onRecover = async () => {
    try {
      const result = await (passkeyManager as any).recoverAccountFlow({
        accountId: targetAccountId,
        options: {
          onEvent: async (event: any) => {
            if (
              event.phase === AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE
              && event.status === AccountRecoveryStatus.SUCCESS
            ) {
              await refreshLoginState();
            }
          },
          onError: (error: any) => {
            console.error('Recovery error:', error);
          }
        }
      });
      if (result?.success) {
        toast.success(`Account ${targetAccountId} recovered successfully!`);
        return;
      } else {
        throw new Error(result?.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Recovery error:', err);
      toast.error(friendlyWebAuthnMessage(err), { id: 'recovery' });
      throw err;
    }
  };

  const onLogin = async () => {
    // Return the promise so caller can await and catch
    return loginPasskey(targetAccountId, {
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
    <div className="passkey-login-container-root">
      <PasskeyAuthMenu
        defaultMode={accountExists ? AuthMenuMode.Login : AuthMenuMode.Register}
        socialLogin={{}}
        // socialLogin={{
        //   google: () => 'username is: <gmail_email@gmail>',
        //   x: () => 'username is <twitter_handle@x>',
        //   apple: () => 'username is <email@apple>'
        // }}
        onLogin={onLogin}
        onRegister={onRegister}
        onRecoverAccount={onRecover}
        linkDeviceOptions={{
          onEvent: (event: DeviceLinkingSSEEvent) => {
            const toastId = 'device-linking';
            switch (event.phase) {
              case DeviceLinkingPhase.STEP_1_QR_CODE_GENERATED:
                toast.loading('QR code ready. Scan it with your other device.', { id: toastId });
                break;
              case DeviceLinkingPhase.STEP_2_SCANNING:
                toast.loading('Waiting for Device 1 to scan the QR code…', { id: toastId });
                break;
              case DeviceLinkingPhase.STEP_3_AUTHORIZATION:
                toast.loading('Authorize linking on Device 1…', { id: toastId });
                break;
              case DeviceLinkingPhase.STEP_4_POLLING:
                toast.loading('Confirming new device with the network…', { id: toastId });
                break;
              case DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED:
                toast.loading('Device key detected on-chain. Wrapping up…', { id: toastId });
                break;
              case DeviceLinkingPhase.STEP_6_REGISTRATION:
                toast.loading('Registering authenticator for this device…', { id: toastId });
                break;
              case DeviceLinkingPhase.STEP_7_LINKING_COMPLETE:
                toast.success('Device linked successfully!', { id: toastId });
                break;
              case DeviceLinkingPhase.STEP_8_AUTO_LOGIN:
                toast.loading('Auto-login in progress…', { id: toastId });
                break;
              case DeviceLinkingPhase.DEVICE_LINKING_ERROR:
              case DeviceLinkingPhase.LOGIN_ERROR:
              case DeviceLinkingPhase.REGISTRATION_ERROR: {
                toast.error(event.error, { id: toastId });
                break;
              }
              default:
                console.log("Unexpected Link Device event")
                break;
            }
          },
          onError: (error: Error) => {
            const toastId = 'device-linking';
            console.error('Device linking error:', error);
            toast.error(error.message || 'Device linking failed', { id: toastId });
          }
        }}
      />
    </div>
  );
}
