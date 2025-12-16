import {
  useTatchi,
  RegistrationPhase,
  RegistrationStatus,
  LoginPhase,
  AuthMenuMode,
  DeviceLinkingPhase,
  DeviceLinkingStatus
} from '@tatchi-xyz/sdk/react'
import {
  type RegistrationSSEEvent,
  AccountRecoveryPhase,
  AccountRecoveryStatus,
  type DeviceLinkingSSEEvent
} from '@tatchi-xyz/sdk/react'
import { PasskeyAuthMenu } from '@tatchi-xyz/sdk/react'
import { toast } from 'sonner'

import { friendlyWebAuthnMessage } from '../utils/strings'
import './PasskeyLoginMenu.css'
import { useAuthMenuControl } from '../contexts/AuthMenuControl'


export function PasskeyLoginMenu(props: { onLoggedIn?: (nearAccountId?: string) => void }) {
  const {
    accountInputState: {
      targetAccountId,
      accountExists
    },
    loginAndCreateSession,
    registerPasskey,
    refreshLoginState,
    tatchi,
    loginState,
    logout,
  } = useTatchi();

  // let tutorial control the menu (programmatically open/close menus)
  const authMenuControl = useAuthMenuControl();

  const onRegister = async () => {
    const result = await registerPasskey(targetAccountId, {
      onEvent: (event: RegistrationSSEEvent) => {
        switch (event.phase) {
          case RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION:
            toast.loading("Starting registration...", { id: 'registration' });
            break;
          case RegistrationPhase.STEP_2_KEY_GENERATION:
            if (event.status === RegistrationStatus.SUCCESS) {
              toast.success("Keys generated...", { id: 'registration' });
            }
            break;
          case RegistrationPhase.STEP_3_CONTRACT_PRE_CHECK:
            toast.loading("Pre-checking contract and account state...", { id: 'registration' });
            break;
          case RegistrationPhase.STEP_4_ACCESS_KEY_ADDITION:
            toast.loading("Creating account...", { id: 'registration' });
            break;
          case RegistrationPhase.STEP_5_CONTRACT_REGISTRATION:
            toast.loading("Registering with Web3Authn contract...", { id: 'registration' });
            break;
          case RegistrationPhase.STEP_6_ACCOUNT_VERIFICATION:
            toast.loading(event.message, { id: 'registration' });
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
      const startedLoggedIn = !!loginState?.isLoggedIn;
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
      // Ensure logout if we're currently logged in after a cancelled/error flow
      try {
        if (loginState?.isLoggedIn) {
          await logout();
        }
      } catch {}
      throw err;
    }
  };

  const onLogin = async () => {
    const result = await loginAndCreateSession(targetAccountId, {
      // Mint a JWT session via the relay server if session.kind is provided
      // session: {
      //   kind: 'jwt',
      // },
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
    if (result?.success) {
      // Surface the minted JWT via toast (truncate to 8 chars)
      if (result.jwt) {
        const short = String(result.jwt).slice(0, 16);
        toast.success(`Session JWT minted: ${short}…`, { id: 'jwt' });
        console.log('[tatchi-docs] JWT returned:', result.jwt);
      }
      props.onLoggedIn?.(result?.nearAccountId);
    }
    return result
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
      <PasskeyAuthMenu
        // Keep the key stable across accountExists changes to avoid
        // remounting the menu (which causes input focus + content flashes).
        key={`pam2-${authMenuControl.defaultModeOverride ?? 'auto'}-${authMenuControl.remountKey}`}
        defaultMode={authMenuControl.defaultModeOverride ?? (accountExists ? AuthMenuMode.Login : AuthMenuMode.Register)}
        onLogin={onLogin}
        loadingScreenDelayMs={0}
        headings={{
          registration: {
            title: 'Register Account',
            subtitle: 'Demo: Create a wallet with Passkey',
          },
        }}
        onRegister={onRegister}
        onRecoverAccount={onRecover}
        linkDeviceOptions={{
          onEvent: onLinkDeviceEvents,
          onError: (error: Error) => {
            const toastId = 'device-linking';
            console.error('Device linking error:', error);
            toast.error(error.message || 'Device linking failed', { id: toastId });
          },
          onCancelled: () => { toast.dismiss('device-linking') }
        }}
      />
    </div>
  );
}
