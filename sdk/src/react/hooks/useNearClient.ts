import { useMemo } from 'react';
import { MinimalNearClient, type NearClient } from '@/index';
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@/core/defaultConfigs';

export const useNearClient = (rpcNodeURL: string = PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl): NearClient => {
  const nearClient = useMemo(() => {
    return new MinimalNearClient(rpcNodeURL);
  }, [rpcNodeURL]);

  return nearClient;
};
