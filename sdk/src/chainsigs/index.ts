/**
 * Optional helper entry for chainsig/viem integrations.
 *
 * This module intentionally lives outside the main React/Core entrypoints so
 * applications that do not use chainsig / MPC features never pull these
 * dependencies into their initial bundles.
 *
 * Usage:
 * ```ts
 * import { loadChainsigs } from '@tatchi-xyz/sdk/chainsigs';
 *
 * const { chainsig, viem } = await loadChainsigs();
 * const { chainAdapters, contracts } = chainsig;
 * // ... use viem + chainsig.js as needed
 * ```
 */

// Dynamic imports so bundlers can place these heavy deps into a separate chunk.
export async function loadChainsigs(): Promise<{
  chainsig: any;
  viem: any;
}> {
  const [chainsig, viem] = await Promise.all([
    import('chainsig.js'),
    import('viem'),
  ]);
  return { chainsig, viem };
}

export default loadChainsigs;

