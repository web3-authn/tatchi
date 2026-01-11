# Chain Signatures Docs

This guide provides instructions for implementing NEAR Chain Signatures as per https://docs.near.org/chain-abstraction/chain-signatures/implementation.

 It covers the overall flow, the MPC contract addresses, how to initialize the library, and the five steps to prepare, sign, and relay a transaction.

 Examples below use the EVM adapter, but the same flow applies to Bitcoin, Solana, XRP, Sui, and Aptos via their respective adapters.


## Overview

Chain Signatures let a NEAR account (including smart contracts) sign and execute transactions on other blockchains. A single NEAR account can thus control addresses and assets across many chains.

Library: chainsig.js — https://github.com/NearDeFi/chainsig.js

For Rust smart contracts that build cross‑chain transactions on‑chain, see Omni Transaction — https://github.com/near/omni-transaction-rs


## MPC Contracts

Use the Chain Signatures MPC contract deployed on NEAR:

- Mainnet: `v1.signer`
- Testnet: `v1.signer-prod.testnet`

The MPC network currently comprises 8 nodes.


## Initialize the Contract and Chain Adapter (EVM example)

1) Instantiate the Chain Signatures contract wrapper:

```ts
import { contracts, chainAdapters } from 'chainsig.js';

export const SIGNET_CONTRACT = new contracts.ChainSignatureContract({
  networkId: 'mainnet' /* or 'testnet' */,
  contractId: 'v1.signer' /* or 'v1.signer-prod.testnet' on testnet */,
});
```

2) Instantiate a chain adapter for your target chain. For EVM:

```ts
import { createPublicClient, http } from 'viem';

const publicClient = createPublicClient({
  transport: http(rpcUrl), // e.g. an Ethereum/Base/Polygon RPC endpoint
});

const Evm = new chainAdapters.evm.EVM({
  publicClient,
  contract: SIGNET_CONTRACT,
});
```

Tip: Switch EVM networks by changing `rpcUrl`. You can find many RPC URLs at https://chainlist.org/?testnets=true


## The Five Steps to Create a Chain Signature

### 1) Derive the Foreign Address

Chain Signatures derive “foreign” addresses deterministically from:
- The NEAR account that calls the MPC contract (e.g., `example.near`, `example.testnet`).
- A derivation path (e.g., `ethereum-1`, `ethereum-2`, ...).
- The MPC service’s master public key (internal to the library).

EVM example:

```ts
const { address } = await Evm.deriveAddressAndPublicKey(
  signedAccountId,        // NEAR account ID authorizing the signature
  derivationPath          // e.g., 'ethereum-1'
);
```

Notes:
- The same NEAR account + path always yields the same foreign address.
- Example: `example.near` + `ethereum-1` → a stable EVM address.


### 2) Create the Transaction (unsigned) and Hash/Payload

Prepare the transaction to be signed using the adapter’s helper (returns the unsigned transaction and the hash/payload to sign):

```ts
const unsigned = await Evm.prepareTransactionForSigning({
  from: senderAddress,
  to: receiverAddress,
  // value in Wei as BigInt (1 ETH = 10^18 Wei)
  value: BigInt(Web3.utils.toWei(transferAmountEth, 'ether')),
});

// Depending on the adapter, you will also receive the hash/payload(s) to sign.
```


### 3) Request the Signature from the MPC Contract

Call the NEAR MPC contract to sign the payload(s). Provide:
1. The `payloads` (array of hashes) to sign from step 2.
2. The derivation `path` (string; e.g., `ethereum-1`).
3. The `key_version` (number; usually `0` unless you’ve rotated).
4. The `keyType` — `"Ecdsa"` for secp256k1 chains (EVM, Bitcoin) or `"Eddsa"` for ed25519 chains (Solana, etc.).
5. A `signerAccount` object containing the NEAR `accountId` and a `signAndSendTransactions` function (e.g., from Wallet Selector) to authorize the on‑chain call.

```ts
const rsvSignatures = await SIGNET_CONTRACT.sign({
  payloads: hashesToSign,      // array; hex 0x… strings or bytes per adapter
  path: derivationPath,        // e.g. 'ethereum-1'
  key_version: 0,              // rotate as needed
  keyType: 'Ecdsa',            // optional when implied by adapter
  signerAccount: {
    accountId: signedAccountId,
    signAndSendTransactions,   // from wallet selector or similar
  },
});
```

Info: The contract’s `sign` call yields/resumes under the hood and can take time while the MPC network produces the signature.


### 4) Format the Signature and Finalize the Signed Transaction

Use the adapter to attach the returned signature(s) and produce a finalized, signed transaction:

```ts
const signedTransaction = Evm.finalizeTransactionSigning({
  transaction: unsigned,
  rsvSignatures, // result from step 3
});
```


### 5) Relay the Signed Transaction

Broadcast the signed transaction to the target network:

```ts
const txHash = await Evm.broadcastTx(signedTransaction);
```

Use the returned hash to track the transaction on an explorer for your chain.


## Testnet Configuration (EVM)

The following test networks, RPCs, explorers, and demo contract addresses are available for quick testing. These contract addresses correspond to a simple demo contract with `set(uint256)` and `get()`.

```ts
import { contracts } from 'chainsig.js';

export const NetworksEVM = [
  {
    network: 'Ethereum',
    token: 'ETH',
    rpcUrl: 'https://sepolia.drpc.org',
    explorerUrl: 'https://sepolia.etherscan.io/tx/',
    contractAddress: '0xFf3171733b73Cfd5A72ec28b9f2011Dc689378c6',
  },
  {
    network: 'Base',
    token: 'BASE',
    rpcUrl: 'https://base-sepolia.drpc.org',
    explorerUrl: 'https://base-sepolia.blockscout.com/tx/',
    contractAddress: '0x2d5B67280267309D259054BB3214f74e42c8a98c',
  },
  {
    network: 'BNB Chain',
    token: 'BNB',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
    explorerUrl: 'https://testnet.bscscan.com/tx/',
    contractAddress: '0xf1A94B7Dfc407527722c91434c35c894287d1e52',
  },
  {
    network: 'Avalanche',
    token: 'AVAX',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    explorerUrl: 'https://subnets-test.avax.network/c-chain/tx/',
    contractAddress: '0x03a74694bD865437eb4f83c5ed61D22000A9f502',
  },
  {
    network: 'Polygon',
    token: 'POL',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerUrl: 'https://www.oklink.com/es-la/amoy/tx/',
    contractAddress: '0x03a74694bD865437eb4f83c5ed61D22000A9f502',
  },
  {
    network: 'Arbitrum',
    token: 'ARB',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorerUrl: 'https://sepolia.arbiscan.io/tx/',
    contractAddress: '0x03a74694bD865437eb4f83c5ed61D22000A9f502',
  },
];

export const NetworkId = 'testnet';
export const MPC_CONTRACT = 'v1.signer-prod.testnet';
export const MPC_KEY =
  'secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3';

export const SIGNET_CONTRACT = new contracts.ChainSignatureContract({
  networkId: NetworkId,
  contractId: MPC_CONTRACT,
});

export const ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: '_num', type: 'uint256' },
    ],
    name: 'set',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'get',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'num',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

export const CHAIN_ICONS = {
  ETH: 'ethereum',
  BASE: 'base',
  BNB: 'binance',
  AVAX: 'avalanche',
  POL: 'polygon',
  ARB: 'arbitrum',
  BTC: 'bitcoin',
  SOL: 'solana',
  SUI: 'sui',
  APT: 'aptos',
  XRP: 'xrp',
};
```

Notes:
- Use `NetworkId = 'testnet'` with `MPC_CONTRACT = 'v1.signer-prod.testnet'` when targeting testnet. For mainnet, use `networkId: 'mainnet'` and `contractId: 'v1.signer'`.
- `MPC_KEY` is the MPC network’s master public key (used by the library to derive foreign addresses). You typically don’t need to pass it directly.


## Complete EVM Examples

Below are two end‑to‑end examples using the EVM adapter: a native transfer and a contract call. Both follow the same 5‑step flow.

Setup (shared):

```ts
import { contracts, chainAdapters } from 'chainsig.js';
import { createPublicClient, http } from 'viem';
import { encodeFunctionData, parseAbi } from 'viem';

// Pick a test network entry
const net = NetworksEVM.find(n => n.network === 'Ethereum')!; // Sepolia

const publicClient = createPublicClient({ transport: http(net.rpcUrl) });
const SIGNET_CONTRACT = new contracts.ChainSignatureContract({
  networkId: 'testnet',
  contractId: 'v1.signer-prod.testnet',
});
const Evm = new chainAdapters.evm.EVM({ publicClient, contract: SIGNET_CONTRACT });

const signedAccountId = 'example.testnet'; // NEAR account to authorize MPC sign
const derivationPath = 'ethereum-1';
```

1) Native transfer (ETH on Sepolia):

```ts
const { address: senderAddress } = await Evm.deriveAddressAndPublicKey(
  signedAccountId,
  derivationPath
);

const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
  from: senderAddress,
  to: '0xReceiverAddress',
  value: BigInt('1000000000000000'), // 0.001 ETH in Wei
});

const rsvSignatures = await SIGNET_CONTRACT.sign({
  payloads: hashesToSign,
  path: derivationPath,
  keyType: 'Ecdsa',
  signerAccount: { accountId: signedAccountId, signAndSendTransactions },
});

const signedTx = Evm.finalizeTransactionSigning({ transaction, rsvSignatures });
const txHash = await Evm.broadcastTx(signedTx);
console.log('Explorer:', `${net.explorerUrl}${txHash}`);
```

2) Contract call (set(uint256) on the demo contract):

```ts
// Encode function data (using viem)
const iface = parseAbi([
  'function set(uint256 _num)',
  'function get() view returns (uint256)',
]);
const data = encodeFunctionData({ abi: iface, functionName: 'set', args: [123n] });

const { address: senderAddress } = await Evm.deriveAddressAndPublicKey(
  signedAccountId,
  derivationPath
);

const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
  from: senderAddress,
  to: net.contractAddress,
  value: 0n,
  data,
});

const rsvSignatures = await SIGNET_CONTRACT.sign({
  payloads: hashesToSign,
  path: derivationPath,
  keyType: 'Ecdsa',
  signerAccount: { accountId: signedAccountId, signAndSendTransactions },
});

const signedTx = Evm.finalizeTransactionSigning({ transaction, rsvSignatures });
const txHash = await Evm.broadcastTx(signedTx);
console.log('Explorer:', `${net.explorerUrl}${txHash}`);
```

Implementation detail: `signAndSendTransactions` should be provided by your NEAR wallet integration (e.g., Wallet Selector). In this repository, you can wire it through your existing passkey‑backed NEAR signing flow.


## Adapters for Other Chains

Instantiate and use the corresponding adapter for chains such as Bitcoin, Solana, XRP, Sui, and Aptos. The flow (derive → prepare → sign → finalize → broadcast) is the same; only the adapter APIs and payload formats differ.


## Key Points & Tips

- Deterministic Addresses: A given NEAR account + derivation path always maps to the same foreign address on the target chain.
- Key Types: Choose `Ecdsa` (secp256k1) vs `Eddsa` (ed25519) based on the chain’s signature scheme.
- Wallet Integration: `signerAccount.signAndSendTransactions` should submit the NEAR transaction that calls `sign` on the MPC contract.
- Multiple EVM Networks: Switch networks by changing the RPC URL used to build the `publicClient`.


## Using TatchiPasskey instead of Wallet Selector

If you’re not using the `chainsig.js` wrapper and want to call the MPC contract directly through TatchiPasskey, send a NEAR FunctionCall with JSON args matching the contract schema:

```ts
await tatchi.executeAction({
  nearAccountId,
  receiverId: 'v1.signer-prod.testnet',
  actionArgs: {
    type: ActionType.FunctionCall,
    methodName: 'sign',
    args: {
      payloads: [signingHashHex], // array; e.g. ['0x…']
      path: 'ethereum-1',
      key_version: 0,
      // optionally: key_type: 'Ecdsa' if your deployment requires explicit type
    },
    gas: '150000000000000',
    deposit: '0',
  },
});
```

Common mistakes that cause `Failed to deserialize input from JSON`:
- Using `payload` (singular) instead of `payloads` (array).
- Omitting a required field like `key_version`.
- Passing numbers as strings (e.g., `'0'`): prefer JSON number (0) when the contract expects a number.
- Supplying hex without `0x` prefix or the wrong encoding expected by your adapter (hex vs base64). The EVM adapter uses 0x‑hex payloads.


## EIP‑1559 Fee Sanity (EVM)

When preparing EVM transactions, ensure `maxFeePerGas >= maxPriorityFeePerGas` or libraries like viem will throw `TipAboveFeeCapError` during serialization. Either:
- Clamp automatically: `maxFeePerGas = max(maxFeePerGas, maxPriorityFeePerGas)`; or
- Estimate from RPC: `feeCap ≈ baseFee * 2 + priorityTip`.


## Handling the MPC Response

The MPC `sign` response returned via NEAR may be bytes (base64 in SuccessValue) or JSON, depending on the wrapper. For EVM you need `r`, `s`, and `v`/`yParity`:

```ts
// Example decode if you receive base64 SuccessValue
const bytes = base64ToBytes(successValue);
// 65-byte RSV: r[0..31], s[32..63], v[64]
const r = '0x' + toHex(bytes.slice(0, 32));
const s = '0x' + toHex(bytes.slice(32, 64));
const v = bytes[64];           // 27/28 or 0/1 depending on backend

const rawTx = serializeTransaction(unsignedTx, { r, s, v });
const txHash = await publicClient.sendRawTransaction({ serializedTransaction: rawTx });
```

Adapters (like chainsig.js’ EVM) provide helpers to finalize and broadcast. If you roll your own (via viem), ensure the signature field format matches (yParity vs v).


## Troubleshooting

- `Failed to deserialize input from JSON` (NEAR ExecutionError)
  - Use `payloads` (array) instead of `payload`; include `path` and `key_version`.
  - Ensure numeric fields are JSON numbers, not strings.
  - Confirm payload encoding (0x‑hex for EVM) and `0x` prefix present.

- `TipAboveFeeCapError` (viem)
  - Ensure `maxFeePerGas >= maxPriorityFeePerGas` before serialization.
  - Consider fetching `baseFeePerGas` and computing a sane cap.


## Adapter Finalize Gotchas (EVM)

When using `chainsig.js` EVM adapter’s `finalizeTransactionSigning`, keep these in mind:
- Signature fields: provide `r` and `s` as 32‑byte hex (do not include `0x`), and `v` as 27/28. If you only have `yParity` (0/1), convert via `v = yParity + 27`.
- Transaction fields: coerce types before finalization. Use numbers for `chainId` and `nonce`, bigints for `gas`, `maxFeePerGas`, `maxPriorityFeePerGas`, and `value`. Ensure `data` is a hex string (use `'0x'` for empty).
- Access list: ensure it’s an array (empty array if omitted).

If you serialize via viem directly instead of the adapter, use `0x`‑prefixed `r` and `s` and pass either `v` (27/28) or `yParity` (0/1) according to viem’s type.

Type alias used for adapter finalize input:

```ts
// For adapter finalizeTransactionSigning
export type EVMUnsignedTransaction = TransactionRequest & {
  type: 'eip1559';
  chainId: number;
};
```

Example finalize with normalization and adapter‑first strategy:

```ts
// Simple coercers
const toNumber = (v: unknown, d = 0) => (typeof v === 'number' ? v : (typeof v === 'bigint' ? Number(v) : d));
const toBigInt = (v: unknown, d = 0n) => (typeof v === 'bigint' ? v : (typeof v === 'number' ? BigInt(v) : d));

// Normalize MPC signature → adapter RSV
const normalized = {
  // r/s without 0x for adapter finalize
  r: rawR.replace(/^0x/i, ''),
  s: rawS.replace(/^0x/i, ''),
  v: typeof yParity === 'number' ? yParity + 27 : vIn, // 27/28
};

const txForFinalize: EVMUnsignedTransaction = {
  ...unsignedTx,
  chainId: toNumber(unsignedTx.chainId, chainId),
  nonce: toNumber(unsignedTx.nonce, 0),
  to: unsignedTx.to || toAddr,
  gas: toBigInt(unsignedTx.gas, 21000n),
  maxFeePerGas: toBigInt(unsignedTx.maxFeePerGas, 0n),
  maxPriorityFeePerGas: toBigInt(unsignedTx.maxPriorityFeePerGas, 0n),
  value: toBigInt(unsignedTx.value, 0n),
  data: unsignedTx.data ?? '0x',
  accessList: Array.isArray(unsignedTx.accessList) ? unsignedTx.accessList : [],
  type: 'eip1559',
};

// Adapter finalize → raw tx (hex)
const raw = await Evm.finalizeTransactionSigning({
  transaction: txForFinalize,
  rsvSignatures: [normalized],
});
```

Common serialization error: Invalid byte sequence ('0x')
- Cause: passing fields with the wrong type/shape, e.g., `r`/`s` not 32‑byte hex, or double‑prefixed hex.
- Fix: ensure `r`/`s` are exactly 32‑byte values; for adapter finalize, strip `0x`; for viem direct serialization, include `0x`.
- Also confirm `data` is a hex string (use `'0x'` for empty) and that fee fields are bigints.


## Broadcast Fallback

Prefer the adapter’s broadcast if available:

```ts
let txHash: string;
if (typeof Evm.broadcastTx === 'function') {
  txHash = await Evm.broadcastTx(raw);
} else {
  // Fallback to viem if adapter method is absent
  txHash = await publicClient.sendRawTransaction({ serializedTransaction: raw });
}
```


## Vite/Node Polyfills for chainsig.js

chainsig.js expects Node globals (Buffer, process). In Vite, add polyfills:

```ts
// vite.config.ts
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      protocolImports: true,
      globals: { Buffer: true, process: true },
    }),
  ],
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  resolve: {
    alias: {
      stream: 'stream-browserify',
      crypto: 'crypto-browserify',
      buffer: 'buffer',
      process: 'process/browser',
    },
  },
});
```


## Environment and RPC Notes

- Adapter vs viem ordering: adapter‑first then viem fallback tends to work well; depending on environment, you may invert. Keep a single place to choose the order.
- RPC reliability: for demos, Base Sepolia has been reliable. Ensure your endpoint permits CORS, or proxy appropriately during local development.
- Explorers: build links conditionally; if broadcast fails, don’t render an explorer URL.


## Smart‑Contract Builders (Omni Transaction)

If you want to build cross‑chain transactions directly in a NEAR smart contract, see Omni Transaction (Rust):
- Repository: https://github.com/near/omni-transaction-rs
- Use with the MPC contract in this guide to produce and relay chain‑agnostic transaction intents.
