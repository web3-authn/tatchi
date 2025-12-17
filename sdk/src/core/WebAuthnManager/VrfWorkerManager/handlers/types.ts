import type {
  VRFWorkerMessage,
  VRFWorkerResponse,
  WasmVrfWorkerRequestType,
} from '../../../types/vrf-worker';
import type { VrfWorkerManagerContext } from '..';

export interface VrfWorkerManagerHandlerContext {
  ensureWorkerReady: (requireHealthCheck?: boolean) => Promise<void>;
  sendMessage: <T extends WasmVrfWorkerRequestType>(
    message: VRFWorkerMessage<T>,
    customTimeout?: number
  ) => Promise<VRFWorkerResponse>;
  generateMessageId: () => string;

  getContext: () => VrfWorkerManagerContext;

  postToWorker: (message: unknown, transfer?: Transferable[]) => void;

  getCurrentVrfAccountId: () => string | null;
  setCurrentVrfAccountId: (next: string | null) => void;
}

