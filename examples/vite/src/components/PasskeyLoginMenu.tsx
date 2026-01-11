import React from 'react'
import {
  useTatchi,
  RegistrationPhase,
  RegistrationStatus,
  LoginPhase,
  AuthMenuMode,
  DeviceLinkingPhase,
  AccountRecoveryPhase,
  AccountRecoveryStatus,
  type RegistrationSSEEvent,
  type DeviceLinkingSSEEvent
} from '@tatchi-xyz/sdk/react'
import { PasskeyAuthMenu } from '@tatchi-xyz/sdk/react/passkey-auth-menu'
import preloadPasskeyAuthMenu from '@tatchi-xyz/sdk/react/passkey-auth-menu/preload'

import toast from 'react-hot-toast'
import { friendlyWebAuthnMessage } from '../utils/strings'

export function PasskeyLoginMenu() {
  const {
    accountInputState: {
      targetAccountId,
      accountExists
    },
    loginAndCreateSession,
    registerPasskey,
    refreshLoginState,
    tatchi,
  } = useTatchi();

  const onRegister = async () => {
    const result = await registerPasskey(targetAccountId, {
      onEvent: (event: RegistrationSSEEvent) => {
        switch (event.phase) {
          case RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION:
            toast.loading('Starting registration...', { id: 'registration' });
            break;
          case RegistrationPhase.STEP_2_KEY_GENERATION:
            if (event.status === RegistrationStatus.SUCCESS) {
              toast.success(`Keys generated...`, { id: 'registration' });
            }
            break;
          case RegistrationPhase.STEP_3_CONTRACT_PRE_CHECK:
            toast.loading(`Checking account availability...`, { id: 'registration' });
            break;
          case RegistrationPhase.STEP_4_ACCESS_KEY_ADDITION:
            toast.loading(`Creating account...`, { id: 'registration' });
            break;
          case RegistrationPhase.STEP_5_CONTRACT_REGISTRATION:
            toast.loading(`Registering with Web3Authn contract...`, { id: 'registration' });
            break;
          case RegistrationPhase.STEP_8_REGISTRATION_COMPLETE:
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
      const tx = result.transactionId ? ` tx: ${result.transactionId}` : '';
      toast.success(`Registration completed: ${tx}`, { id: 'registration' });
      return;
    } else {
      throw new Error(result.error || 'Registration failed');
    }
  };

  const onRecover = async () => {
    try {
      const result = await tatchi.recoverAccountFlow({
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
    return loginAndCreateSession(targetAccountId, {
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

  const onLinkDeviceEvents = async (event: DeviceLinkingSSEEvent) => {
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
        toast.loading('Device key detected on-chain…', { id: toastId });
        break;
      case DeviceLinkingPhase.STEP_6_REGISTRATION:
        toast.loading('Registering authenticator for this device…', { id: toastId });
        break;
      case DeviceLinkingPhase.STEP_7_LINKING_COMPLETE:
        toast.success('Device linked successfully!', { id: toastId });
        break;
      case DeviceLinkingPhase.STEP_8_AUTO_LOGIN:
        toast.loading('Login in progress…', { id: toastId });
        break;
      case DeviceLinkingPhase.DEVICE_LINKING_ERROR:
      case DeviceLinkingPhase.LOGIN_ERROR:
      case DeviceLinkingPhase.REGISTRATION_ERROR: {
        toast.error(event.error, { id: toastId });
        break;
      }
      default:
        console.warn("Unexpected Link Device event")
        break;
    }
  }

  return (
    <div className="passkey-login-container-root">
      <PrefetchOnIntent onIntent={() => void preloadPasskeyAuthMenu().catch(() => {})}>
        <PasskeyAuthMenu
          defaultMode={accountExists ? AuthMenuMode.Login : AuthMenuMode.Register}
          onLogin={onLogin}
          onRegister={onRegister}
          onRecoverAccount={onRecover}
          linkDeviceOptions={{
            onEvent: onLinkDeviceEvents,
            onError: (error: Error) => {
              const toastId = 'device-linking';
              console.error('Device linking error:', error);
              toast.error(error.message || 'Device linking failed', { id: toastId });
            },
            onCancelled: () => { try { toast.dismiss('device-linking'); } catch {} }
          }}
        />
      </PrefetchOnIntent>
    </div>
  );
}

function PrefetchOnIntent(props: { onIntent: () => void; children: React.ReactNode }) {
  const didPrefetchRef = React.useRef(false)
  const onIntentOnce = React.useCallback(() => {
    if (didPrefetchRef.current) return
    didPrefetchRef.current = true
    props.onIntent()
  }, [props.onIntent])

  return (
    <div
      style={{ display: 'contents' }}
      onPointerOver={onIntentOnce}
      onMouseOver={onIntentOnce}
      onFocusCapture={onIntentOnce}
      onTouchStart={onIntentOnce}
    >
      {props.children}
    </div>
  )
}
