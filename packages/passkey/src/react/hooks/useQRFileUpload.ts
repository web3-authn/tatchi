import { useRef, useCallback } from 'react';
import type { DeviceLinkingQRData } from '@/index';

export interface UseQRFileUploadOptions {
  onQRDetected?: (qrData: DeviceLinkingQRData) => void;
  onError?: (error: Error) => void;
}

export interface UseQRFileUploadReturn {
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  isProcessing: boolean;
}

export const useQRFileUpload = (options: UseQRFileUploadOptions): UseQRFileUploadReturn => {
  const { onQRDetected, onError } = options;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(false);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('useQRFileUpload: File upload -', { name: file.name, type: file.type, size: file.size });

    try {
      isProcessingRef.current = true;

      const { scanQRCodeFromFile } = await import('../../utils/qrScanner');
      const parsedQRData = await scanQRCodeFromFile(file);

      console.log('useQRFileUpload: Valid file QR -', {
        device2PublicKey: parsedQRData.device2PublicKey,
        accountId: parsedQRData.accountId
      });

      onQRDetected?.(parsedQRData);

    } catch (err: any) {
      console.error('useQRFileUpload: File processing failed -', err.message);
      onError?.(err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [onQRDetected, onError]);

  return {
    fileInputRef,
    handleFileUpload,
    isProcessing: isProcessingRef.current,
  };
};