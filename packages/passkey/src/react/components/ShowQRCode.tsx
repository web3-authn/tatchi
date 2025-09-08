import { useState, useRef, useEffect } from 'react'

import { usePasskeyContext } from '../context'
import type { LinkDeviceFlow } from '../../core/PasskeyManager/linkDevice'
import { DeviceLinkingSSEEvent, DeviceLinkingStatus, DeviceLinkingPhase } from '../../core/types/passkeyManager'
import './ShowQRCode.css'

interface ShowQRCodeProps {
  isOpen: boolean;
  onClose: () => void;
  onEvent: (event: DeviceLinkingSSEEvent) => void;
  onError: (error: Error) => void;
  /** Optional pre-created flow. If provided, ShowQRCode uses it instead of creating one. */
  deviceLinkingFlow?: LinkDeviceFlow;
  /** If using a provided flow, whether ShowQRCode should cancel it on close. Defaults to true. */
  manageFlowLifecycle?: boolean;
}

export function ShowQRCode({
  isOpen,
  onClose,
  onEvent,
  onError,
  deviceLinkingFlow,
  manageFlowLifecycle = true,
}: ShowQRCodeProps) {

  const { startDeviceLinkingFlow } = usePasskeyContext();

  const [deviceLinkingState, setDeviceLinkingState] = useState<{
    mode: 'idle' | 'device1' | 'device2';
    qrCodeDataURL?: string;
    isProcessing: boolean;
  }>({ mode: 'idle', isProcessing: false });

  // Store the flow instance to allow proper cleanup
  const flowRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (flowRef.current) {
        flowRef.current?.cancel();
        flowRef.current = null;
      }
    };
  }, []);

  // Auto-start QR generation when modal opens; cancel when closing or unmounting
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setDeviceLinkingState({ mode: 'device2', isProcessing: true });

    // Use provided flow if present; otherwise create one and forward events
    const device2Flow: LinkDeviceFlow = deviceLinkingFlow ?? startDeviceLinkingFlow({
      onEvent: (event: DeviceLinkingSSEEvent) => {
        if (cancelled) return;
        onEvent(event);
        if (
          event.phase === DeviceLinkingPhase.STEP_7_LINKING_COMPLETE &&
          event.status === DeviceLinkingStatus.SUCCESS
        ) {
          try { onClose(); } catch {}
        }
      },
      onError: (error: Error) => {
        if (cancelled) return;
        setDeviceLinkingState({ mode: 'idle', isProcessing: false });
        onError(error);
        try { onClose(); } catch {}
      },
    });

    flowRef.current = device2Flow;

    (async () => {
      try {
        const { qrCodeDataURL } = await device2Flow.generateQR();
        if (!cancelled) {
          setDeviceLinkingState(prev => ({ ...prev, qrCodeDataURL, isProcessing: false }));
        }
      } catch (err) {
        if (!cancelled) {
          setDeviceLinkingState({ mode: 'idle', isProcessing: false });
        }
      }
    })();

    return () => {
      cancelled = true;
      // Only cancel the flow if we created it here, or if explicit lifecycle management is desired
      const shouldCancel = !deviceLinkingFlow || manageFlowLifecycle;
      if (shouldCancel) {
        device2Flow.cancel();
      }
      if (flowRef.current === device2Flow) {
        flowRef.current = null;
      }
    };
  }, [isOpen, deviceLinkingFlow, manageFlowLifecycle]);

  if (!isOpen) return null;

  return (
    <div className="qr-code-container" onClick={(e) => e.stopPropagation()}>
      <div className="qr-header">
        <h2 className="qr-title">Scan and Link Device</h2>
      </div>

      <div className="qr-body">
        {deviceLinkingState.mode === 'device2' && (
          <div className="qr-code-section">
            {deviceLinkingState.qrCodeDataURL ? (
              <div className="qr-code-display">
                <img
                  src={deviceLinkingState.qrCodeDataURL}
                  alt="Device Linking QR Code"
                  className="qr-code-image"
                />
              </div>
            ) : (
              <div className="qr-loading">
                <p>Generating QR code...</p>
              </div>
            )}
            {deviceLinkingState.qrCodeDataURL && (
              <>
                <div className="qr-instruction">Scan to backup your other device.</div>
                <div className="qr-status">Waiting for your other device to scan<span className="animated-ellipsis"></span></div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
