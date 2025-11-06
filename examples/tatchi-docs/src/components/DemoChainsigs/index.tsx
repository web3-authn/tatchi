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
import { useDerivedEvmAddress } from './hooks/useDerivedEvmAddress';
import ChainFieldsCard from './ChainFieldsCard';

export const DemoChainsigs: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const { isWorking, signAndSendEvmTransfer, signAndSendErc20Transfer } = useMpcEvmFlow();
  const [rpcOverride, setRpcOverride] = useState<string>('');
  const {
    address: derivedAddress,
    setAddress: setDerivedAddress,
    deriveAndCache,
    loadCached
  } = useDerivedEvmAddress();
  const [chainFieldsExpanded, setChainFieldsExpanded] = useState<boolean>(false);

  // EVM tx inputs (simple EIP-1559 transfer)
  const [chainId, setChainId] = useState<string>('');
  const [to, setTo] = useState<string>('0x8454d149Beb26E3E3FC5eD1C87Fb0B2a1b7B6c2c');
  const [amountEth, setAmountEth] = useState<string>('0.001');
  const [asset, setAsset] = useState<'ETH' | 'USDC'>('ETH');
  const [tokenAddress, setTokenAddress] = useState<string>(
    '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' // ETH_SEPOLIA_USDC
  );

  // MPC parameters
  const [mpcContractId, setMpcContractId] = useState<string>('');
  const [path] = useState<string>('ethereum-1');
  // key version not needed in current adapter calls

  const chainIdNum = useMemo(() => {
    const n = Number((chainId || '').trim() || '11155111');
    return Number.isFinite(n) && n > 0 ? n : 11155111;
  }, [chainId]);
  const mpcContractIdEffective = useMemo(() => (mpcContractId && mpcContractId.trim()) || 'v1.signer-prod.testnet', [mpcContractId]);

  function toUnitsFromHuman(human: string, decimals: number): string {
    const s = (human || '').trim();
    if (!s) return '0';
    if (!/^\d*(?:\.\d*)?$/.test(s)) throw new Error('Invalid token amount');
    const [intPart = '0', fracPartRaw = ''] = s.split('.');
    const fracPart = fracPartRaw.slice(0, decimals);
    const padded = fracPart.padEnd(decimals, '0');
    const whole = (intPart.replace(/^0+/, '') || '0');
    const units = whole + padded;
    const trimmed = units.replace(/^0+/, '') || '0';
    return trimmed;
  }

  const handleSignViaMpc = useCallback(async () => {
    if (!isLoggedIn || !nearAccountId) return;
    if (!path) {
      toast.error('Configure signing parameters');
      return;
    }
    if (asset === 'ETH') {
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
    } else {
      const token = (tokenAddress || '').trim();
      if (!token) {
        toast.error('Enter USDC token address for Base Sepolia');
        return;
      }
      let amountUnits = '0';
      try {
        amountUnits = toUnitsFromHuman(amountEth, 6);
      } catch (e) {
        toast.error(String((e as Error)?.message || e));
        return;
      }
      await signAndSendErc20Transfer({
        tokenAddress: token,
        to,
        amountUnits,
        chainId: chainIdNum,
        rpcOverride,
        contractId: mpcContractIdEffective,
        path,
        onDerivedAddress: setDerivedAddress,
        toastExplorerLink: true,
      });
    }
  }, [amountEth, asset, chainIdNum, isLoggedIn, mpcContractIdEffective, nearAccountId, path, rpcOverride, setDerivedAddress, signAndSendErc20Transfer, signAndSendEvmTransfer, to, tokenAddress]);

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

  // ETH faucet conditional is now handled inside FaucetLinksRow

  if (!isLoggedIn || !nearAccountId) return null;

  return (
    <GlassBorder style={{ maxWidth: 480, marginTop: '1rem' }}>
      <div className="demo-chainsigs-root">

        <div className="action-section">
          <div className="demo-page-header">
            <h2 className="demo-title">
              {/* Prefer light icon in dark mode; dark icon in light mode */}
              {(() => {
                const darkLogo = `${import.meta.env.BASE_URL}near-logo-dark.svg`;
                const lightLogo = `${import.meta.env.BASE_URL}near-logo-light.svg`;
                return (
                  <picture>
                    {/* In dark mode, use the light logo; default to dark logo */}
                    <source srcSet={lightLogo} media="(prefers-color-scheme: dark)" />
                    <img
                      src={darkLogo}
                      alt="NEAR logo"
                      width={24}
                      height={24}
                      style={{ display: 'inline-block' }}
                    />
                  </picture>
                );
              })()}
              <span>NEAR Intents Demo</span>
            </h2>
          </div>
          <div className="action-text">
            <div className="demo-subtitle">
              Send EVM transactions using TouchID
            </div>
            Request a Chain Signature from NEAR intents contract,
            then broadcast it to the Ethereum Sepolia network.
          </div>

          <div className="input-group"
            style={{
              marginTop: '2rem',
              paddingTop: '2rem',
              borderTop: '1px solid var(--fe-border)'
            }}
          >
            <label style={{ textAlign: "center", margin: '0rem 0 0.25rem 0' }}>
              Your derived ETH address is
            </label>
            <DerivedAddressPill address={derivedAddress} />
          </div>

          {derivedAddress ? (
            <FaucetLinksRow
              chainId={chainIdNum}
              address={derivedAddress}
              rpcOverride={rpcOverride}
              asset={asset}
              amountHuman={amountEth}
              tokenAddress={tokenAddress}
            />
          ) : null}

          <ChainFieldsCard
            to={to}
            onChangeTo={setTo}
            amountEth={amountEth}
            onChangeAmount={setAmountEth}
            asset={asset}
            onChangeAsset={setAsset}
            chainId={chainId}
            onChangeChainId={setChainId}
            rpcOverride={rpcOverride}
            onChangeRpcOverride={setRpcOverride}
            tokenAddress={tokenAddress}
            onChangeTokenAddress={setTokenAddress}
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
            {asset === 'ETH' ? 'Sign and Send ETH Transfer' : 'Sign and Send USDC Transfer'}
          </LoadingButton>
        </div>
      </div>
    </GlassBorder>
  );
};

export default DemoChainsigs;
