import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../Select';
// Use public/ assets via BASE_URL-aware paths so dev/prod both work
const ethIconUrl = `${import.meta.env.BASE_URL}eth.png`;
const usdcIconUrl = `${import.meta.env.BASE_URL}usdc.png`;

export interface ChainFieldsCardProps {
  to: string;
  onChangeTo: (v: string) => void;
  amountEth: string;
  onChangeAmount: (v: string) => void;
  asset: 'ETH' | 'USDC';
  onChangeAsset: (v: 'ETH' | 'USDC') => void;
  chainId: string;
  onChangeChainId: (v: string) => void;
  rpcOverride: string;
  onChangeRpcOverride: (v: string) => void;
  tokenAddress?: string;
  onChangeTokenAddress?: (v: string) => void;
  mpcContractId: string;
  onChangeMpcContractId: (v: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}

export const ChainFieldsCard: React.FC<ChainFieldsCardProps> = ({
  to,
  onChangeTo,
  amountEth,
  onChangeAmount,
  asset,
  onChangeAsset,
  chainId,
  onChangeChainId,
  rpcOverride,
  onChangeRpcOverride,
  tokenAddress,
  onChangeTokenAddress,
  mpcContractId,
  onChangeMpcContractId,
  expanded,
  onToggleExpanded,
}) => {
  return (
    <div className="chain-fields-card">
      <div className="input-group">
        <label>Send to Recipient (ETH address)</label>
        <input className="multi-tx-input" value={to} onChange={(e) => onChangeTo(e.target.value)} placeholder="0x…" />
      </div>

      <div className="input-group" style={{ flex: 0.33 }}>
        <label>Amount ({asset})</label>
      </div>
      <div className="chain-fields-asset-input">
        <div className="input-group" style={{ flex: 0.33 }}>
          <input className="multi-tx-input" value={amountEth} onChange={(e) => onChangeAmount(e.target.value)} placeholder="0.01" />
        </div>
        <div className="input-group" style={{ flex: 0.66 }}>
          <Select value={asset} onValueChange={(v) => onChangeAsset(v as 'ETH' | 'USDC')}>
            <SelectTrigger className="asset-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ETH">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <img src={ethIconUrl} alt="ETH" width={16} height={16} />
                  ETH (Sepolia)
                </span>
              </SelectItem>
              <SelectItem value="USDC">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <img src={usdcIconUrl} alt="USDC" width={16} height={16} />
                  USDC (Sepolia)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* <div className={`chain-fields-advanced ${expanded ? 'expanded' : ''}`}>
        <div className="input-group">
          <label className="input-text-secondary">chainId</label>
          <input className="multi-tx-input" value={chainId} onChange={(e) => onChangeChainId(e.target.value)} placeholder="11155111 (Ethereum Sepolia)" />
        </div>

        <div className="input-group">
          <label className="input-text-secondary">RPC override</label>
          <input className="multi-tx-input" value={rpcOverride} onChange={(e) => onChangeRpcOverride(e.target.value)} placeholder="https://sepolia.gateway.tenderly.co" />
        </div>

        <div className="input-group">
          <label className="input-text-secondary">MPC Contract ID (NEAR)</label>
          <input className="multi-tx-input" value={mpcContractId} onChange={(e) => onChangeMpcContractId(e.target.value)} placeholder="v1.signer-prod.testnet" />
        </div>
      </div> */}

      {/* <div className="chain-fields-toggle-row">
        <button
          type="button"
          className="chain-fields-toggle"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls="chain-fields-advanced"
        >
          <span className="chevron" aria-hidden>{expanded ? '▾' : '▸'}</span>
          Network details
        </button>
      </div> */}

    </div>
  );
};

export default ChainFieldsCard;
