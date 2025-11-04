import React from 'react';

export interface ChainFieldsCardProps {
  to: string;
  onChangeTo: (v: string) => void;
  amountEth: string;
  onChangeAmountEth: (v: string) => void;
  chainId: string;
  onChangeChainId: (v: string) => void;
  rpcOverride: string;
  onChangeRpcOverride: (v: string) => void;
  mpcContractId: string;
  onChangeMpcContractId: (v: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}

export const ChainFieldsCard: React.FC<ChainFieldsCardProps> = ({
  to,
  onChangeTo,
  amountEth,
  onChangeAmountEth,
  chainId,
  onChangeChainId,
  rpcOverride,
  onChangeRpcOverride,
  mpcContractId,
  onChangeMpcContractId,
  expanded,
  onToggleExpanded,
}) => {
  return (
    <div className="chain-fields-card">
      <div className="input-group">
        <label>Recipient (ETH address)</label>
        <input className="multi-tx-input" value={to} onChange={(e) => onChangeTo(e.target.value)} placeholder="0x…" />
      </div>

      <div id="chain-fields-advanced" className={`chain-fields-advanced ${expanded ? 'expanded' : ''}`}>
        <div className="input-group">
          <label>Amount (ETH)</label>
          <input className="multi-tx-input" value={amountEth} onChange={(e) => onChangeAmountEth(e.target.value)} placeholder="0.01" />
        </div>

        <div className="input-group">
          <label>chainId</label>
          <input className="multi-tx-input" value={chainId} onChange={(e) => onChangeChainId(e.target.value)} placeholder="84532 (Base Sepolia)" />
        </div>

        <div className="input-group">
          <label>RPC override (optional)</label>
          <input className="multi-tx-input" value={rpcOverride} onChange={(e) => onChangeRpcOverride(e.target.value)} placeholder="https://sepolia.base.org" />
        </div>

        <div className="input-group">
          <label>MPC Contract ID (NEAR)</label>
          <input className="multi-tx-input" value={mpcContractId} onChange={(e) => onChangeMpcContractId(e.target.value)} placeholder="v1.signer-prod.testnet" />
        </div>
      </div>

      <div className="chain-fields-toggle-row">
        <button
          type="button"
          className="chain-fields-toggle"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls="chain-fields-advanced"
        >
          <span className="chevron" aria-hidden>{expanded ? '▾' : '▸'}</span>
          Transaction details
        </button>
      </div>
    </div>
  );
};

export default ChainFieldsCard;

