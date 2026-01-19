import React from 'react';
import type { DeviceLinkingSSEEvent } from '@/core/types/sdkSentEvents';
import type { PasskeyAuthMenuRuntime } from '../adapters/tatchi';
import { AuthMenuMode, type PasskeyAuthMenuProps } from '../types';
import { usePasskeyAuthMenuForceInitialRegister } from '../hydrationContext';
import { useAuthMenuMode } from './mode';
import { getProceedEligibility } from './proceedEligibility';

export interface PasskeyAuthMenuLinkDeviceController {
  isOpen: boolean;
  onClose: () => void;
  onEvent: (event: DeviceLinkingSSEEvent) => void;
  onError: (error: Error) => void;
}

export interface PasskeyAuthMenuController {
  mode: AuthMenuMode;
  title: { title: string; subtitle: string };
  waiting: boolean;
  showScanDevice: boolean;
  showEmailRecovery: boolean;
  currentValue: string;
  postfixText?: string;
  isUsingExistingAccount?: boolean;
  secure: boolean;
  canShowContinue: boolean;
  canSubmit: boolean;
  onSegmentChange: (next: AuthMenuMode) => void;
  onInputChange: (val: string) => void;
  onProceed: () => void;
  onResetToStart: () => void;
  openScanDevice: () => void;
  openEmailRecovery: () => void;
  closeEmailRecovery: () => void;
  closeLinkDeviceView: (reason: 'user' | 'flow') => void;
  linkDevice: PasskeyAuthMenuLinkDeviceController;
}

export function usePasskeyAuthMenuController(
  props: Pick<
    PasskeyAuthMenuProps,
    'onLogin' | 'onRegister' | 'onSyncAccount' | 'defaultMode' | 'headings' | 'linkDeviceOptions'
  >,
  runtime: PasskeyAuthMenuRuntime,
): PasskeyAuthMenuController {
  const secure = typeof window !== 'undefined' ? window.isSecureContext : true;
  const currentValue = runtime.inputUsername;
  const setCurrentValue = runtime.setInputUsername;
  const forceInitialRegister = usePasskeyAuthMenuForceInitialRegister();

  const { mode, setMode, title, onSegmentChange: onSegmentChangeBase, onInputChange: onInputChangeBase, resetToDefault } = useAuthMenuMode({
    defaultMode: props.defaultMode,
    accountExists: runtime.accountExists,
    currentValue,
    setCurrentValue,
    headings: props.headings,
    forceInitialRegister,
  });

  const latestValueRef = React.useRef<string>(currentValue);
  React.useEffect(() => {
    latestValueRef.current = currentValue;
  }, [currentValue]);

  // Recent-login prefill state (from lazy feature island).
  const prefilledFromRecentRef = React.useRef(false);
  const prefilledValueRef = React.useRef<string>('');
  const prevModeRef = React.useRef<AuthMenuMode | null>(null);
  const lastUserSelectedModeRef = React.useRef<AuthMenuMode | null>(null);

  const clearPrefillMarkers = React.useCallback(() => {
    prefilledFromRecentRef.current = false;
    prefilledValueRef.current = '';
  }, []);

  const onSegmentChange = React.useCallback(
    (next: AuthMenuMode) => {
      lastUserSelectedModeRef.current = next;
      if (mode === AuthMenuMode.Login && next !== AuthMenuMode.Login) {
        if (prefilledFromRecentRef.current && currentValue === prefilledValueRef.current) {
          setCurrentValue('');
        }
        clearPrefillMarkers();
      }
      onSegmentChangeBase(next);
    },
    [mode, currentValue, setCurrentValue, onSegmentChangeBase, clearPrefillMarkers],
  );

  const onInputChange = React.useCallback(
    (val: string) => {
      if (val !== prefilledValueRef.current) {
        prefilledFromRecentRef.current = false;
      }
      onInputChangeBase(val);
    },
    [onInputChangeBase],
  );

  const { canShowContinue, canSubmit } = getProceedEligibility({
    mode,
    currentValue,
    accountExists: runtime.accountExists,
    secure,
  });

  const [waiting, setWaiting] = React.useState(false);
  const [showScanDevice, setShowScanDevice] = React.useState(false);
  const [showEmailRecovery, setShowEmailRecovery] = React.useState(false);

  // If the user is attempting to register but we discover the account already exists,
  // automatically switch them to the Login tab.
  React.useEffect(() => {
    if (waiting) return;
    if (mode !== AuthMenuMode.Register) return;
    if (!runtime.accountExists) return;
    if (lastUserSelectedModeRef.current === AuthMenuMode.Register) return;
    setMode(AuthMenuMode.Login);
  }, [mode, runtime.accountExists, setMode, waiting]);

  // Lazy feature-island: entering Login can prefill the last used account username.
  React.useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;

    const enteringLogin = mode === AuthMenuMode.Login && prevMode !== AuthMenuMode.Login;
    if (!enteringLogin) return;
    if (latestValueRef.current.trim().length > 0) return;

    let cancelled = false;
    void import('../features/recentLoginPrefill')
      .then(async (m) => {
        const result = await m.getRecentLoginPrefill(runtime.tatchiPasskey);
        if (cancelled || !result?.username) return;
        if (prevModeRef.current !== AuthMenuMode.Login) return;
        if (latestValueRef.current.trim().length > 0) return;

        setCurrentValue(result.username);
        prefilledFromRecentRef.current = true;
        prefilledValueRef.current = result.username;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [mode, runtime.tatchiPasskey, setCurrentValue]);

  const fallbackOnEvent = React.useCallback((event: DeviceLinkingSSEEvent) => {
    console.log('ShowQRCode event:', event);
  }, []);

  const fallbackOnError = React.useCallback((error: Error) => {
    console.error('ShowQRCode error:', error);
  }, []);

  const handleLinkDeviceEvent = props.linkDeviceOptions?.onEvent ?? fallbackOnEvent;
  const handleLinkDeviceError = props.linkDeviceOptions?.onError ?? fallbackOnError;
  const handleLinkDeviceCancelled = props.linkDeviceOptions?.onCancelled;

  const stopLinkDeviceFlow = React.useCallback(() => {
    const stopper = runtime.stopDevice2LinkingFlow;
    if (!stopper) return;
    void stopper().catch(() => {});
  }, [runtime.stopDevice2LinkingFlow]);

  const closeLinkDeviceView = React.useCallback(
    (reason: 'user' | 'flow') => {
      stopLinkDeviceFlow();
      setShowScanDevice(false);
      if (reason === 'user') {
        handleLinkDeviceCancelled?.();
      }
    },
    [stopLinkDeviceFlow, handleLinkDeviceCancelled],
  );

  const onResetToStart = React.useCallback(() => {
    setWaiting(false);
    if (showScanDevice) {
      closeLinkDeviceView('user');
    } else {
      setShowScanDevice(false);
    }
    setShowEmailRecovery(false);
    lastUserSelectedModeRef.current = null;
    resetToDefault();
    setCurrentValue('');
    clearPrefillMarkers();
  }, [showScanDevice, closeLinkDeviceView, resetToDefault, setCurrentValue, clearPrefillMarkers]);

  const onProceed = React.useCallback(() => {
    if (!canSubmit) return;

    setWaiting(true);

    void (async () => {
      try {
        if (mode === AuthMenuMode.Sync) {
          await props.onSyncAccount?.();
          setWaiting(false);
          setMode(AuthMenuMode.Login);
        } else if (mode === AuthMenuMode.Login) {
          await props.onLogin?.();
          setWaiting(false);
          closeLinkDeviceView('flow');
          setMode(AuthMenuMode.Login);
        } else {
          await props.onRegister?.();
          setWaiting(false);
          setMode(AuthMenuMode.Login);
        }
      } catch {
        if (mode === AuthMenuMode.Login) {
          setWaiting(false);
          closeLinkDeviceView('flow');
          setMode(mode);
          return;
        }
        onResetToStart();
      }
    })();
  }, [
    canSubmit,
    mode,
    props.onSyncAccount,
    props.onLogin,
    props.onRegister,
    setMode,
    closeLinkDeviceView,
    onResetToStart,
  ]);

  const openScanDevice = React.useCallback(() => {
    setShowEmailRecovery(false);
    setShowScanDevice(true);
  }, []);

  const openEmailRecovery = React.useCallback(() => {
    stopLinkDeviceFlow();
    setShowScanDevice(false);
    setShowEmailRecovery(true);
  }, [stopLinkDeviceFlow]);

  const closeEmailRecovery = React.useCallback(() => {
    setShowEmailRecovery(false);
  }, []);

  const linkDevice: PasskeyAuthMenuLinkDeviceController = React.useMemo(
    () => ({
      isOpen: showScanDevice,
      onClose: () => closeLinkDeviceView('flow'),
      onEvent: handleLinkDeviceEvent,
      onError: handleLinkDeviceError,
    }),
    [showScanDevice, closeLinkDeviceView, handleLinkDeviceEvent, handleLinkDeviceError],
  );

  return {
    mode,
    title,
    waiting,
    showScanDevice,
    showEmailRecovery,
    currentValue,
    postfixText: runtime.displayPostfix,
    isUsingExistingAccount: runtime.isUsingExistingAccount,
    secure,
    canShowContinue,
    canSubmit,
    onSegmentChange,
    onInputChange,
    onProceed,
    onResetToStart,
    openScanDevice,
    openEmailRecovery,
    closeEmailRecovery,
    closeLinkDeviceView,
    linkDevice,
  };
}

export default usePasskeyAuthMenuController;
