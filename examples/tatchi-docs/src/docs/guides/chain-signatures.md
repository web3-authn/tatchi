---
title: Chain Signatures
---

# Chain Signatures

This guide shows how to integrate NEAR Chain Signatures to sign and relay transactions on external chains.

## Overview

Chain Signatures let a NEAR account (including smart contracts) sign and execute transactions on other blockchains. A single NEAR account can control addresses and assets across many chains.

Library: `chainsig.js` — https://github.com/NearDeFi/chainsig.js

For Rust smart contracts that build cross-chain transactions on-chain, see Omni Transaction — https://github.com/near/omni-transaction-rs

## MPC Contracts

Use the Chain Signatures MPC contract deployed on NEAR:

- Mainnet: `v1.signer`
- Testnet: `v1.signer-prod.testnet`

The MPC network currently comprises 8 nodes.

## Initialize the Contract and Chain Adapter (EVM example)

1) Instantiate the Chain Signatures contract wrapper:

```ts
import { contracts, chainAdapters } from 'chainsig.js'

export const SIGNET_CONTRACT = new contracts.ChainSignatureContract({
  networkId: 'mainnet', // or 'testnet'
  contractId: 'v1.signer', // or 'v1.signer-prod.testnet' on testnet
})
```

2) Instantiate a chain adapter for your target chain. For EVM:

```ts
import { createPublicClient, http } from 'viem'

const publicClient = createPublicClient({
  transport: http(rpcUrl), // e.g. an Ethereum/Base/Polygon RPC endpoint
})

const Evm = new chainAdapters.evm.EVM({
  publicClient,
  contract: SIGNET_CONTRACT,
})
```

Tip: Switch EVM networks by changing `rpcUrl`. You can find many RPC URLs at https://chainlist.org/?testnets=true

## The Five Steps to Create a Chain Signature

### 1) Derive the Foreign Address

Chain Signatures derive foreign addresses deterministically from:

- The NEAR account that calls the MPC contract.
- A derivation path (e.g., `ethereum-1`, `ethereum-2`).
- The MPC service’s master public key (internal to the library).

```ts
const { address } = await Evm.deriveAddressAndPublicKey(
  signedAccountId,        // NEAR account ID authorizing the signature
  derivationPath          // e.g., 'ethereum-1'
)
```

### 2) Create the Transaction and Hash/Payload

```ts
const unsigned = await Evm.prepareTransactionForSigning({
  from: senderAddress,
  to: receiverAddress,
  value: BigInt(Web3.utils.toWei(transferAmountEth, 'ether')),
})
```

### 3) Request the Signature from the MPC Contract

```ts
const rsvSignatures = await SIGNET_CONTRACT.sign({
  payloads: hashesToSign,
  path: derivationPath,
  key_version: 0,
  keyType: 'Ecdsa',
  signerAccount: {
    accountId: signedAccountId,
    signAndSendTransactions,
  },
})
```

### 4) Finalize the Signed Transaction

```ts
const signedTransaction = Evm.finalizeTransactionSigning({
  transaction: unsigned,
  rsvSignatures,
})
```

### 5) Relay the Signed Transaction

```ts
const txHash = await Evm.broadcastTx(signedTransaction)
```

## Testnet Configuration (EVM)

These test networks, RPCs, explorers, and demo contract addresses are available for quick testing:

```ts
import { contracts } from 'chainsig.js'

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
]

export const NetworkId = 'testnet'
export const MPC_CONTRACT = 'v1.signer-prod.testnet'
```
