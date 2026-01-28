import { useCallback, useRef, useState } from 'react';
import { useTatchi } from '../context';
import type {
  ExtensionMigrationEvent,
  ExtensionMigrationOptions,
  ExtensionMigrationResult,
  ExtensionMigrationState,
} from '@/core/types/extensionMigration';

export interface UseExtensionMigrationOptions {
  onEvent?: (event: ExtensionMigrationEvent) => void;
  onError?: (error: Error) => void;
  cleanup?: ExtensionMigrationOptions['cleanup'];
}

export interface UseExtensionMigrationReturn {
  state: ExtensionMigrationState;
  lastEvent: ExtensionMigrationEvent | null;
  startMigration: (accountId: string) => Promise<ExtensionMigrationResult>;
  cancelMigration: (message?: string) => void;
}

export const useExtensionMigration = (options: UseExtensionMigrationOptions = {}): UseExtensionMigrationReturn => {
  const { tatchi } = useTatchi();
  const [state, setState] = useState<ExtensionMigrationState>(() => tatchi.getExtensionMigrationState());
  const [lastEvent, setLastEvent] = useState<ExtensionMigrationEvent | null>(null);

  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const startMigration = useCallback(async (accountId: string) => {
    const { onEvent, onError, cleanup } = callbacksRef.current;
    const res = await tatchi.startExtensionMigration({
      accountId,
      options: {
        cleanup,
        onEvent: (event) => {
          setLastEvent(event);
          setState(tatchi.getExtensionMigrationState());
          onEvent?.(event);
        },
        onError: (error) => {
          setState(tatchi.getExtensionMigrationState());
          onError?.(error);
        },
      },
    });
    setState(res.state);
    return res;
  }, [tatchi]);

  const cancelMigration = useCallback((message?: string) => {
    tatchi.cancelExtensionMigration(message);
    setState(tatchi.getExtensionMigrationState());
  }, [tatchi]);

  return { state, lastEvent, startMigration, cancelMigration };
};
