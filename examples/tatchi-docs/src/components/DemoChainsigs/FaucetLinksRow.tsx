import React, { useEffect, useMemo, useState } from 'react';
import * as viem from 'viem';
import type { PublicClient, Hex } from 'viem';
import { faucetLinksForChainId } from './hooks/helpers/faucetLinks';
import { chooseRpc } from './hooks/useEvmRpc';

export interface FaucetLinksRowProps {
  chainId: number;
  address?: Hex;              // EVM address to check for balances
  rpcOverride?: string;
  minEth?: string;            // fallback threshold in ETH (default 0.02)
  asset?: 'ETH' | 'USDC';     // currently selected asset
  amountHuman?: string;       // human amount entered in the UI
  tokenAddress?: string;      // ERC-20 address when asset is USDC
}

// Helpers kept outside the component for clarity/readability
const isHexAddress = (s?: string) => !!s && /^0x[0-9a-fA-F]{40}$/.test(s);

const erc20Abi = viem.parseAbi([
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)'
]);

export const FaucetLinksRow: React.FC<FaucetLinksRowProps> = ({ chainId, address, rpcOverride, minEth = '0.02', asset, amountHuman, tokenAddress }) => {
  const [hasEnoughGas, setHasEnoughGas] = useState(false);
  const [needsUsdc, setNeedsUsdc] = useState(false);
  const [checked, setChecked] = useState(false); // gate rendering until RPC completes

  const shouldCheck = useMemo(() => {
    return !!address;
  }, [address]);

  useEffect(() => {

    const getClient = async (): Promise<PublicClient> => {
      const rpc = await chooseRpc(chainId, rpcOverride);
      return viem.createPublicClient({ transport: viem.http(rpc, { timeout: 10000 }) });
    };

    const computeEthHasEnough = async (client: PublicClient): Promise<boolean> => {
      if (!shouldCheck || !address) return true; // assume sufficient if we cannot check
      const bal = await client.getBalance({ address: address });
      // Estimate minimal gas need depending on transfer type
      const gasUnits = asset === 'USDC' ? 65000n : 21000n; // rough typicals
      let gasNeedWei: bigint | null = null;
      const gasPrice = await client.getGasPrice();
      gasNeedWei = (gasPrice * gasUnits * 12n) / 10n; // +20% headroom
      if (asset === 'ETH') {
        // Need enough for amount + gas; when amount is 0/invalid, only check gas
        let wantFromAmount = amountHuman ? viem.parseEther(amountHuman) : 0n;
        const requiredEth = gasNeedWei + wantFromAmount;
        return bal >= requiredEth;
      } else {
        // For USDC path, only ensure enough ETH for gas
        return bal >= gasNeedWei;
      }
    };

    const computeNeedsUsdc = async (client: PublicClient): Promise<boolean> => {
      if (asset !== 'USDC' || !address || !isHexAddress(tokenAddress)) return false;
      // Resolve decimals (fallback to 6 on failure)
      let decimals = 6;
      try {
        const d = await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'decimals'
        });
        if (typeof d === 'number') decimals = d;
      } catch (e) {
        console.error('[FaucetLinksRow] decimals() read failed', { chainId, tokenAddress, address }, e);
      }

      // Read balance, bail (no warning) if we cannot verify
      let balU: bigint;
      try {
        balU = await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`]
        }) as bigint;
      } catch (e) {
        console.error('[FaucetLinksRow] balanceOf() read failed', { chainId, tokenAddress, address }, e);
        return false;
      }

      const have = Number.parseFloat(viem.formatUnits(balU, decimals));
      const want = Number.isFinite(Number.parseFloat((amountHuman || '').trim()))
        ? Number.parseFloat((amountHuman || '0').trim())
        : 0;
      return have < want;
    };

    const run = async () => {
      try {
        const client = await getClient();
        const hasEnoughEth = await computeEthHasEnough(client);
        const needUsdc = await computeNeedsUsdc(client);
        setHasEnoughGas(hasEnoughEth);
        setNeedsUsdc(needUsdc);
      } catch (e) {
        console.error('[FaucetLinksRow] balance checks failed', { chainId, asset, address, tokenAddress }, e);
        // On failure to check, do not show faucet boxes by default
        setHasEnoughGas(true);
        setNeedsUsdc(false);
      } finally {
        setChecked(true);
      }
    };

    run();
    return () => {};
  }, [address, asset, amountHuman, chainId, minEth, rpcOverride, shouldCheck, tokenAddress]);

  const links = faucetLinksForChainId(chainId);
  const wantsEth = !!(checked && !hasEnoughGas && links?.length);
  const wantsUsdc = !!(checked && asset === 'USDC' && needsUsdc);
  const wantsExpanded = wantsEth || wantsUsdc;

  const [renderEth, setRenderEth] = useState(false);
  const [renderUsdc, setRenderUsdc] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (wantsExpanded) {
      setRenderEth(wantsEth);
      setRenderUsdc(wantsUsdc);
      setExpanded(true);
    } else if (expanded) {
      // Begin collapse; keep content mounted until transition ends
      setExpanded(false);
    } else {
      // Fully collapsed
      setRenderEth(false);
      setRenderUsdc(false);
    }
    // We intentionally exclude `expanded` to avoid re-entrancy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsEth, wantsUsdc, wantsExpanded]);

  const onTransitionEnd: React.TransitionEventHandler<HTMLDivElement> = (e) => {
    if (e.target !== e.currentTarget) return;
    if (!expanded && !wantsExpanded) {
      setRenderEth(false);
      setRenderUsdc(false);
    }
  };

  return (
    <div
      className={`faucet-warning-root ${expanded ? 'expanded' : ''}`}
      onTransitionEnd={onTransitionEnd}
    >
      <div className="faucet-warning-wrapper">
        {renderEth && (
          <div className={`faucet-warning ${wantsEth ? 'faucet-anim-show' : ''}`}>
            Fund your address with test ETH
            <div className="faucet-links">
              {links.map((f) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer noopener">
                  {f.label}
                </a>
              ))}
            </div>
          </div>
        )}
        {renderUsdc && (
          <div className={`faucet-warning ${wantsUsdc ? 'faucet-anim-show' : ''}`} style={{ marginTop: '0.5rem' }}>
            Fund your address with test USDC
            <br/>
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer noopener">Circle USDC faucet (choose Eth Sepolia)</a>
          </div>
        )}
      </div>
    </div>
  );
}

export default FaucetLinksRow;
