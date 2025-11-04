import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LoadingButton } from '../LoadingButton';
import { GlassBorder } from '../GlassBorder';
import '../ActionSection.css';
import './DemoChainsigs.css';

import { usePasskeyContext } from '@tatchi-xyz/sdk/react';

import { useMpcEvmFlow } from './hooks/useMpcEvmFlow';
import DerivedAddressPill from './DerivedAddressPill';
import FaucetLinksRow from './FaucetLinksRow';
import { explorerTxBaseForChainId } from './utils';
import { useDerivedEvmAddress } from './hooks/useDerivedEvmAddress';
import ChainFieldsCard from './ChainFieldsCard';

export const DemoChainsigs: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const { isWorking, signAndSendEvmTransfer } = useMpcEvmFlow();
  const [rpcOverride, setRpcOverride] = useState<string>('');
  const { address: derivedAddress, setAddress: setDerivedAddress, deriveAndCache, loadCached } = useDerivedEvmAddress();
  const [chainFieldsExpanded, setChainFieldsExpanded] = useState<boolean>(false);

  // EVM tx inputs (simple EIP-1559 transfer)
  const [chainId, setChainId] = useState<string>('');
  const [to, setTo] = useState<string>('0x8454d149Beb26E3E3FC5eD1C87Fb0B2a1b7B6c2c');
  const [amountEth, setAmountEth] = useState<string>('0.00123');
  // simple transfers; gas limit is handled by the adapter

  // MPC parameters
  const [mpcContractId, setMpcContractId] = useState<string>('');
  const [path] = useState<string>('ethereum-1');
  // key version not needed in current adapter calls

  const chainIdNum = useMemo(() => {
    const n = Number((chainId || '').trim() || '84532');
    return Number.isFinite(n) && n > 0 ? n : 84532;
  }, [chainId]);
  const mpcContractIdEffective = useMemo(() => (mpcContractId && mpcContractId.trim()) || 'v1.signer-prod.testnet', [mpcContractId]);

  const handleSignViaMpc = useCallback(async () => {
    if (!isLoggedIn || !nearAccountId) return;
    if (!path) {
      toast.error('Configure signing parameters');
      return;
    }
    await signAndSendEvmTransfer({
      to,
      amountEth,
      chainId: chainIdNum,
      rpcOverride,
      contractId: mpcContractIdEffective,
      path,
      onDerivedAddress: setDerivedAddress,
      toastExplorerLink: true,
    });
  }, [amountEth, chainIdNum, isLoggedIn, mpcContractIdEffective, nearAccountId, path, rpcOverride, setDerivedAddress, signAndSendEvmTransfer, to]);

  // Prefetch cached derived address or derive once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isLoggedIn || !nearAccountId) return;
      try {
        const cached = await loadCached({ nearAccountId, chainId: chainIdNum, contractId: mpcContractIdEffective, path });
        if (!cached && !cancelled) {
          await deriveAndCache({ nearAccountId, chainId: chainIdNum, contractId: mpcContractIdEffective, path, rpcOverride });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [chainIdNum, deriveAndCache, isLoggedIn, loadCached, mpcContractIdEffective, nearAccountId, path, rpcOverride]);

  if (!isLoggedIn || !nearAccountId) return null;

  return (
    <GlassBorder style={{ maxWidth: 480, marginTop: '1rem' }}>
      <div className="demo-chainsigs-root">

        <div className="action-section">
          <div className="demo-page-header">
            <h2 className="demo-title">NEAR Intents Demo</h2>
          </div>
          <div className="action-text">
            Send an EVM transaction on Base using touchID.
            <br />
            Request a Chain Signature from the NEAR MPC contract,
            then broadcast it to the Base Sepolia network.
          </div>

          <div className="input-group"
            style={{
              marginTop: '2rem',
              paddingTop: '2rem',
              borderTop: '1px solid var(--fe-border)'
            }}
          >
            <label style={{ textAlign: "center", margin: '0rem 0 0.25rem 0' }}>
              Derived sender address
            </label>
            <DerivedAddressPill address={derivedAddress} />
          </div>

          {derivedAddress ? (
            <div className="action-text" style={{ margin: '0rem 0rem 2rem 0rem' }}>
              Fund your address with Base Sepolia ETH for this demo
              <FaucetLinksRow chainId={chainIdNum} />
            </div>
          ) : null}

          <ChainFieldsCard
            to={to}
            onChangeTo={setTo}
            amountEth={amountEth}
            onChangeAmountEth={setAmountEth}
            chainId={chainId}
            onChangeChainId={setChainId}
            rpcOverride={rpcOverride}
            onChangeRpcOverride={setRpcOverride}
            mpcContractId={mpcContractId}
            onChangeMpcContractId={setMpcContractId}
            expanded={chainFieldsExpanded}
            onToggleExpanded={() => setChainFieldsExpanded((v) => !v)}
          />

          <LoadingButton
            onClick={handleSignViaMpc}
            loading={isWorking}
            loadingText="Processing..."
            variant="primary"
            size="medium"
            style={{ width: '100%', height: '55px' }}
            textStyles={{ fontSize: '1rem' }}
          >
            Sign and Send Base Transfer
          </LoadingButton>
        </div>
      </div>
    </GlassBorder>
  );
};

export default DemoChainsigs;
