import React from 'react';
import * as viem from 'viem';
import { faucetLinksForChainId } from './faucetLinks';

export type AssetKind = 'ETH' | 'USDC';

function networkNameForChainId(chainId: number): string {
  switch (chainId) {
    case 11155111: return 'Ethereum Sepolia';
    case 84532: return 'Base Sepolia';
    case 80002: return 'Polygon Amoy';
    case 43113: return 'Avalanche Fuji';
    case 97: return 'BSC Testnet';
    case 421614: return 'Arbitrum Sepolia';
    default: return `Chain ${chainId}`;
  }
}

function nativeSymbolForChainId(chainId: number): string {
  switch (chainId) {
    case 80002: return 'MATIC';
    case 43113: return 'AVAX';
    case 97: return 'BNB';
    default: return 'ETH'; // Ethereum, Base, Arbitrum testnets use ETH
  }
}

function extractHaveWantWei(msg: string): { have?: bigint; want?: bigint } {
  try {
    const haveMatch = msg.match(/have\s+(\d+)/i);
    const wantMatch = msg.match(/want\s+(\d+)/i);
    const have = haveMatch ? BigInt(haveMatch[1]) : undefined;
    const want = wantMatch ? BigInt(wantMatch[1]) : undefined;
    return { have, want };
  } catch {
    return {};
  }
}

function renderFaucetAnchors(chainId: number): React.ReactElement | undefined {
  const links = faucetLinksForChainId(chainId);
  if (!links?.length) return undefined;
  return (
    <span>
      {' '}
      {links.map((l, i) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener">{l.label}</a>
      )).reduce((acc: React.ReactNode[], el, i) => {
        if (i) acc.push(' • ');
        acc.push(el);
        return acc;
      }, [])}
    </span>
  );
}

export function toUserFriendlyViemError(
  err: unknown,
  ctx: { chainId: number; asset: AssetKind; address?: string; amountEth?: string }
): { title: string; description?: React.ReactElement | string } {
  const name = (err as any)?.name as string | undefined;
  const short = (err as any)?.shortMessage as string | undefined;
  const details = (err as any)?.details as string | undefined;
  const raw = (err instanceof Error ? err.message : (typeof err === 'string' ? err : '')) || '';
  const msg = [short, details, raw].filter(Boolean).join(' \u2014 ');

  const symbol = nativeSymbolForChainId(ctx.chainId);
  const netName = networkNameForChainId(ctx.chainId);
  const faucet = renderFaucetAnchors(ctx.chainId);

  const baseInsufficient = /insufficient funds/i.test(msg);
  const gasValueInsufficient = /insufficient funds for gas \* price \+ value/i.test(msg);

  if (gasValueInsufficient || baseInsufficient) {
    const { have, want } = extractHaveWantWei(msg);
    if (ctx.asset === 'USDC') {
      return {
        title: `Not enough ${symbol} for gas on ${netName}.` ,
        description: (
          <span>
            ERC-20 transfers require a small amount of {symbol} for network fees.
            {typeof want === 'bigint' ? ` Estimated need: ~${viem.formatEther(want)} ${symbol}.` : ''}
            {faucet ? <>{' '}Get some test {symbol}:{faucet}</> : ''}
          </span>
        ),
      };
    }
    // ETH transfer path
    const amountPart = ctx.amountEth && ctx.amountEth.trim() ? ` to send ${ctx.amountEth} ${symbol}` : '';
    return {
      title: `Not enough ${symbol}${amountPart} on ${netName}.`,
      description: (
        <span>
          {typeof have === 'bigint' ? `Balance: ${viem.formatEther(have)} ${symbol}. ` : ''}
          {typeof want === 'bigint' ? `Estimated required: ~${viem.formatEther(want)} ${symbol}. ` : ''}
          {faucet ? <>{' '}Get some test {symbol}:{faucet}</> : ''}
        </span>
      ),
    };
  }

  // ERC-20 common messages
  if (/transfer amount exceeds balance|insufficient balance/i.test(msg)) {
    return { title: 'Insufficient token balance.', description: 'Your USDC balance is lower than the requested amount.' };
  }
  if (/insufficient allowance|allowance/i.test(msg)) {
    return { title: 'USDC allowance too low.', description: 'Increase allowance or use a transfer that does not require allowance.' };
  }

  // Generic fallback
  const title = short || name || 'Transaction failed';
  const description: string = details || raw || 'Check RPC and try again.';
  return { title, description };
}

