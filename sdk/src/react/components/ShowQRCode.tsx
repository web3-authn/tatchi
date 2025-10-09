import { useState, useEffect, useRef } from 'react'

import { usePasskeyContext } from '../context'
import { DeviceLinkingSSEEvent, DeviceLinkingStatus, DeviceLinkingPhase } from '../../core/types/passkeyManager'
import './ShowQRCode.css'

interface ShowQRCodeProps {
  isOpen: boolean;
  onClose: () => void;
  onEvent: (event: DeviceLinkingSSEEvent) => void;
  onError: (error: Error) => void;
}

export function ShowQRCode({
  isOpen,
  onClose,
  onEvent,
  onError,
}: ShowQRCodeProps) {

  const {
    startDevice2LinkingFlow,
    stopDevice2LinkingFlow,
    passkeyManager
  } = usePasskeyContext();

  const [deviceLinkingState, setDeviceLinkingState] = useState<{
    mode: 'idle' | 'device1' | 'device2';
    qrCodeDataURL?: string;
    isProcessing: boolean;
    lastPhase?: string;
    lastMessage?: string;
  }>({ mode: 'idle', isProcessing: false });

  // Prevent duplicate concurrent starts (e.g., React StrictMode double-effect)
  const sessionRef = useRef(0);
  const initCompletedRef = useRef(false);

  // Auto-start QR generation when modal opens; cancel when closing or unmounting
  useEffect(() => {
    if (!isOpen) return;

    const mySession = ++sessionRef.current;
    let cancelled = false;
    setDeviceLinkingState({ mode: 'device2', isProcessing: true });

    (async () => {
      try {
        const { qrCodeDataURL } = await startDevice2LinkingFlow({
          onEvent: (event: DeviceLinkingSSEEvent) => {
            if (cancelled) return;
            // Update UI status line
            setDeviceLinkingState(prev => ({ ...prev, lastPhase: String(event.phase), lastMessage: event.message }));
            onEvent(event);
            if (event.phase === DeviceLinkingPhase.STEP_7_LINKING_COMPLETE && event.status === DeviceLinkingStatus.SUCCESS) {
              try { onClose(); } catch {}
            }
          },
          onError: (error: Error) => {
            if (cancelled) return;
            setDeviceLinkingState({ mode: 'idle', isProcessing: false });
            onError(error);
            try { onClose(); } catch {}
          }
        });
        if (!cancelled && sessionRef.current === mySession) {
          initCompletedRef.current = true;
          setDeviceLinkingState(prev => ({ ...prev, qrCodeDataURL, isProcessing: false }));
        }
      } catch (err) {
        if (!cancelled && sessionRef.current === mySession) {
          setDeviceLinkingState({ mode: 'idle', isProcessing: false });
        }
      }
    })();

    return () => {
      cancelled = true;
      // Invalidate this session so any late resolves are ignored
      sessionRef.current++;
      // Avoid cancelling prematurely during React StrictMode double-invoke
      if (initCompletedRef.current) {
        stopDevice2LinkingFlow().catch(() => {});
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="qr-code-container" onClick={(e) => e.stopPropagation()}>
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
            <div className="qr-header">
              <h2 className="qr-title">Scan and Link Device</h2>
            </div>
            {deviceLinkingState.qrCodeDataURL &&
              <>
                <div className="qr-instruction">Scan to backup your other device.</div>
                <div className="qr-status">
                  {deviceLinkingState.lastMessage || 'Waiting for device to scan'}
                  <span className="animated-ellipsis"></span>
                </div>
              </>
            }
          </div>
        )}
      </div>
    </div>
  );
}
