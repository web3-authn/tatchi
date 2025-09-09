import { useRef, useCallback } from 'react';
import { usePasskeyContext } from '../context';
import {
  DeviceLinkingPhase,
  DeviceLinkingStatus,
  type DeviceLinkingQRData,
  type LinkDeviceResult,
  type DeviceLinkingSSEEvent
} from '@/index';
import { QRScanMode } from '@/react/hooks/useQRCamera';

/**
 * Device Linking Hook
 *
 * Provides device linking functionality with QR code scanning and transaction management.
 *
 * **Important:** This hook must be used inside a PasskeyManager context.
 * Wrap your app with PasskeyProvider or ensure PasskeyManager is available in context.
 *
 * @example
 * ```tsx
 * import { PasskeyProvider } from '@web3authn/passkey/react';
 * import { useDeviceLinking } from '@web3authn/passkey/react';
 *
 * function DeviceLinker() {
 *   const { linkDevice } = useDeviceLinking({
 *     onDeviceLinked: (result) => console.log('Device linked:', result),
 *     onError: (error) => console.error('Error:', error)
 *   });
 *
 *   return <button onClick={() => linkDevice(qrData, QRScanMode.CAMERA)}>
 *     Link Device
 *   </button>;
 * }
 * ```
 */
export interface UseDeviceLinkingOptions {
  onDeviceLinked?: (result: LinkDeviceResult) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onEvent?: (event: DeviceLinkingSSEEvent) => void;
  fundingAmount?: string;
}

export interface UseDeviceLinkingReturn {
  linkDevice: (qrData: DeviceLinkingQRData, source: QRScanMode) => Promise<void>;
}

export const useDeviceLinking = (options: UseDeviceLinkingOptions): UseDeviceLinkingReturn => {
  const { passkeyManager } = usePasskeyContext();
  const {
    onDeviceLinked,
    onError,
    onClose,
    onEvent,
    fundingAmount = '0.05'
  } = options;

  const hasClosedEarlyRef = useRef(false);

  // Use refs for callbacks to avoid dependency changes
  const callbacksRef = useRef({
    onDeviceLinked,
    onError,
    onClose,
    onEvent
  });

  // Update refs when callbacks change
  callbacksRef.current = {
    onDeviceLinked,
    onError,
    onClose,
    onEvent
  };

  // Handle device linking with early close logic and polling
  const linkDevice = useCallback(async (qrData: DeviceLinkingQRData, source: QRScanMode) => {

    const {
      onDeviceLinked,
      onError,
      onClose,
      onEvent
    } = callbacksRef.current;

    try {
      console.log(`useDeviceLinking: Starting device linking from ${source}...`);
      hasClosedEarlyRef.current = false; // Reset for this linking attempt

      const nearClient = passkeyManager.getNearClient();

      const result = await passkeyManager.linkDeviceWithQRCode(qrData, {
        fundingAmount,
        onEvent: (event) => {
          onEvent?.(event);
          console.log(`useDeviceLinking: ${source} linking event -`, event.phase, event.message);
          // Close scanner immediately after QR validation succeeds
          switch (event.phase) {
            case DeviceLinkingPhase.STEP_3_AUTHORIZATION:
              if (event.status === DeviceLinkingStatus.PROGRESS) {
                console.log('useDeviceLinking: QR validation complete - closing scanner while linking continues...');
                hasClosedEarlyRef.current = true;
                onClose?.();
              }
              break;
          }
        },
        onError: (error: any) => {
          console.error(`useDeviceLinking: ${source} linking error -`, error.message);
          onError?.(error);
        }
      });

      console.log(`useDeviceLinking: ${source} linking completed -`, { success: !!result });

      // Start polling to check if Device2 has completed registration and removed the temporary key
      const POLLING_INTERVAL_MS = 4000; // 4 seconds
      const DELETE_KEY_TIMEOUT_MS = 20000; // 20 seconds

      let pollingInterval: NodeJS.Timeout | null = null;
      let deleteKeyTimeout: NodeJS.Timeout | null = null;
      let pollingActive = true;

      // Helper function to check if temporary key exists
      const checkTemporaryKeyExists = async (): Promise<boolean> => {
        try {
          const accessKeyList = await nearClient.viewAccessKeyList(result.linkedToAccount || '');
          return accessKeyList.keys.some(key => key.public_key === result.device2PublicKey);
        } catch (error) {
          console.error(`Failed to check access keys:`, error);
          return false;
        }
      };

      // Helper function to cleanup timers
      const cleanupTimers = () => {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        if (deleteKeyTimeout) {
          clearTimeout(deleteKeyTimeout);
          deleteKeyTimeout = null;
        }
        pollingActive = false;
      };

      // Start polling
      pollingInterval = setInterval(async () => {
        if (!pollingActive) return;

        const tempKeyExists = await checkTemporaryKeyExists();
        if (!tempKeyExists) {
          console.log(`Temporary key no longer exists, stopping polling and clearing timeout`);
          cleanupTimers();
        }
      }, POLLING_INTERVAL_MS);

      // Start timeout to broadcast DeleteKey transaction after timeout
      deleteKeyTimeout = setTimeout(async () => {
        try {
          console.log(`Checking if temporary key still exists after timeout...`);
          const tempKeyExists = await checkTemporaryKeyExists();
          if (tempKeyExists) {
            console.log(`Temporary key still exists, broadcasting DeleteKey transaction for key: ${result.device2PublicKey.substring(0, 20)}...`);
            const deleteKeyTxResult = await nearClient.sendTransaction(result.signedDeleteKeyTransaction!);
            console.log(`DeleteKey transaction broadcasted successfully. Transaction hash: ${deleteKeyTxResult?.transaction?.hash}`);
          } else {
            console.log(`Temporary key no longer exists, no need to broadcast DeleteKey transaction`);
          }
        } catch (error) {
          console.error(`Failed to check access keys or broadcast DeleteKey transaction:`, error);
        }
        cleanupTimers();
      }, DELETE_KEY_TIMEOUT_MS);

      // Cleanup timers on successful completion
      cleanupTimers();

      onDeviceLinked?.(result);

    } catch (linkingError: any) {
      console.error(`useDeviceLinking: ${source} linking failed -`, linkingError.message);
      onError?.(linkingError);

      // Close scanner on error if it hasn't been closed early
      if (!hasClosedEarlyRef.current) {
        console.log('useDeviceLinking: Closing scanner due to linking error...');
        onClose?.();
      }
    }
  }, [fundingAmount, passkeyManager]);

  return {
    linkDevice,
  };
};