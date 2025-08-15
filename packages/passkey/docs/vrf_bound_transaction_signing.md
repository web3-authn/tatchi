# VRF-Bound Transaction Signing

## Overview

This document describes an approach to bind transaction details into the VRF challenge, ensuring that what the user sees is cryptographically bound to what TouchID signs. This provides strong guarantees that transactions cannot be modified after user approval.

## Security Context

WebAuthn's origin scoping provides strong phishing protection - users can only sign transactions for the domain shown in the TouchID prompt. This is a significant security advantage over traditional wallets.

The malicious developer problem (where the app developer themselves is dishonest) is a challenge for ALL wallet types:
- **MetaMask**: Can't verify complex contract calls without reading Solidity
- **Hardware Wallets**: Limited screen space for transaction details
- **Mobile Wallets**: Still rely on the dApp to provide honest transaction data

Our goal with VRF binding is to ensure transaction integrity and create an auditable trail, similar to how MetaMask shows transaction details before signing.

## Solution: Transaction-Bound VRF Challenges (Phase C — deferred)

### 1. Enhanced VRF Challenge Structure

```typescript
interface TransactionBoundVRFChallenge {
  // Standard VRF fields
  rpId: string;
  userId: string;
  blockHeight: string;
  blockHash: string;

  // Transaction binding (digest-first design)
  // Base64url(SHA-256(canonicalJson({ receiverId, actions })))
  txActionsDigest?: string;
  // Duplicated for UX only; not required if you re-derive from digest input
  txReceiverId?: string;

  // Optional: keep richer intent fields for UX, but the digest is the source of truth
  txIntent?: {
    type: 'contract_call' | 'transfer' | 'stake' | 'delete_key' | 'add_key';
    receiverId: string;
    amount?: string; // in yoctoNEAR
    methodName?: string; // for contract calls
    argsHash?: string;   // SHA-256 of canonical JSON args
    gas?: string;
    maxFee?: string;
    summary?: string;    // human-readable summary
  };
}
```

### 2. Challenge Generation Flow (to be wired after confirmation flow)

```typescript
// Frontend: Before TouchID prompt
async function createTransactionBoundChallenge(
  transaction: Transaction,
  blockInfo: BlockInfo
): Promise<VRFChallenge> {
  // 1. Canonicalize the business-critical parts of the transaction
  // Only bind receiverId + actions to avoid unnecessary failures from dynamic fields
  const canonical = canonicalJson({
    receiverId: transaction.receiverId,
    actions: transaction.actions, // must match sdk types in packages/passkey/src/core/types/actions.ts
  });
  const txActionsDigest = base64url(sha256(new TextEncoder().encode(canonical)));

  // Optional: richer intent for UX
  const txIntent = {
    type: detectTransactionType(transaction),
    receiverId: transaction.receiverId,
    amount: sumYoctoFromActions(transaction.actions),
    methodName: findMethodName(transaction.actions),
    argsHash: maybeArgsHash(transaction.actions),
    gas: sumGasFromActions(transaction.actions),
    maxFee: calculateMaxFee(transaction),
    summary: generateHumanReadableSummary(transaction),
  };

  // 2. Create VRF challenge with digest-bound transaction
  const challenge = {
    rpId: window.location.hostname,
    userId: transaction.signerId,
    blockHeight: String(blockInfo.header.height),
    blockHash: blockInfo.header.hash,
    txActionsDigest,
    txReceiverId: transaction.receiverId,
    txIntent, // optional UX helper
  };

  // 3. Display transaction details to user BEFORE TouchID (Shadow DOM or native confirm)
  await displayTransactionConfirmation(txIntent);

  return challenge as VRFChallenge;
}
```

### 3. WASM Worker Verification

```rust
// In handle_sign_transactions_with_actions.rs
pub fn verify_transaction_binding(
    vrf_challenge: &VRFChallenge,
    transaction: &Transaction,
) -> Result<(), String> {
    // If no txActionsDigest present, skip (backwards compatible)
    let expected_digest = match &vrf_challenge.tx_actions_digest {
        Some(d) => d,
        None => return Ok(())
    };

    // Canonicalize receiverId + actions identically to the client
    let canonical = canonical_json(&serde_json::json!({
        "receiverId": transaction.receiver_id,
        "actions": transaction.actions,
    }))?;
    let actual_digest = base64_url_encode(&sha256_bytes(canonical.as_bytes()));

    if &actual_digest != expected_digest {
        return Err("VRF txActionsDigest mismatch".to_string());
    }

    // Optionally, keep existing fine-grained checks using txIntent for richer errors
    Ok(())
}
```

### 4. UI/UX Flow

```typescript
// Example implementation in PasskeyManager
async signTransaction(transaction: Transaction): Promise<SignedTransaction> {
  // 1. Get current block info
  const blockInfo = await this.nearClient.getLatestBlock();

  // 2. Show transaction preview dialog
  const txSummary = generateTransactionSummary(transaction);
  const userConfirmed = await this.showTransactionPreview({
    title: "Confirm Transaction",
    summary: txSummary.summary,
    details: {
      to: transaction.receiverId,
      amount: txSummary.amount,
      method: txSummary.methodName,
      estimatedFee: txSummary.estimatedFee
    }
  });

  if (!userConfirmed) {
    throw new Error("Transaction cancelled by user");
  }

  // 3. Create VRF challenge with bound transaction
  const vrfChallenge = await createTransactionBoundChallenge(
    transaction,
    blockInfo
  );

  // 4. Get WebAuthn signature (TouchID prompt)
  // User sees: "Sign in to wallet.example.com"
  // But the signature cryptographically binds the transaction details
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: encodeVRFChallenge(vrfChallenge),
      // ... other options
    }
  });

  // 5. Send to WASM worker for signing
  // Worker will verify transaction matches VRF challenge
  const signed = await this.signerWorker.signTransaction({
    transaction,
    vrfChallenge,
    credential
  });

  return signed;
}
```

## Benefits

1. **Cryptographic Binding**: Transaction details are cryptographically bound to the TouchID signature
2. **No Bait-and-Switch**: Impossible to show one transaction and sign another
3. **Backwards Compatible**: Old clients without txIntent still work
4. **Flexible**: Can bind as much or as little detail as needed
5. **User-Friendly**: Shows transaction details before TouchID, not during
6. **Origin Security**: WebAuthn ensures only the verified domain can request signatures

## Implementation Phases (aligned with overall sequence)

### Phase A: Confirmation wiring (native confirm)
- Yield/resume confirmation in signer path; native `confirm()` via main thread.

### Phase B: Closed Shadow DOM equality check
- Shadow component displays intent before making the signTransactionsWithActions wasm worker call; worker validates equality before signing.

### Phase C: Optional VRF actionIntent binding
- Extend VRF challenge with optional `actionIntent` including `actionIntentDigest`.

## Security Considerations

1. **Canonicalization**: Must use deterministic JSON encoding for args hash
2. **Time Limits**: VRF challenges should expire after a short time
3. **Replay Protection**: Each challenge should be single-use
4. **Trust Model**: Like all wallets, relies on dApp honesty for complex transactions
5. **Origin Verification**: WebAuthn prevents phishing by binding to specific domains

### Canonicalization spec for txActionsDigest

- Input object: `{ receiverId, actions }`
- Actions must map 1:1 to SDK action types in `packages/passkey/src/core/types/actions.ts`
- Preserve action ordering as submitted
- For FunctionCall args, use canonical JSON for the `args` object before inclusion
- Numbers serialized as decimal strings; amounts in yoctoNEAR strings
- Digest: `base64url(sha256(utf8(JSON.stringify(input))))`

Recommended not to bind volatile fields (nonce, blockHash) inside the digest to avoid unnecessary mismatches. Bind only user-intent fields (receiver + actions). Context fields (blockHeight, blockHash) are already present in the challenge for freshness.

## Example Transaction Summaries

```typescript
// Simple transfer
{
  summary: "Send 10 NEAR to alice.near",
  type: "transfer",
  receiverId: "alice.near",
  amount: "10000000000000000000000000"
}

// Token transfer
{
  summary: "Send 100 USDC to bob.near",
  type: "contract_call",
  receiverId: "usdc.token.near",
  methodName: "ft_transfer",
  argsHash: "0x1234...",
  amount: "0" // NEAR amount
}

// NFT purchase
{
  summary: "Buy 'Cool NFT #123' for 5 NEAR",
  type: "contract_call",
  receiverId: "marketplace.near",
  methodName: "buy",
  argsHash: "0xabcd...",
  amount: "5000000000000000000000000"
}
```

## Future Enhancements

1. **WebAuthn Display Names**: When browsers support it, include transaction summary in TouchID prompt
2. **Hardware Wallet Integration**: Extend to support transaction display on hardware wallets
3. **Smart Contract Integration**: Contracts could require VRF-bound transactions for high-value operations
4. **Cross-Chain Support**: Adapt pattern for other blockchains

## Recommended refinements

- Prefer a digest-first binding (`txActionsDigest`) with optional rich `txIntent` for UX
- Verify the digest in the signer just before signing, and again after any UI confirmation
- Provide a helper in the SDK to compute the exact digest to avoid drift between client and WASM
- Consider adding a network identifier if used across clusters; on NEAR, `rpId` + block hash/height are sufficient for freshness

## Conclusion

VRF-bound transaction signing provides security comparable to existing wallets while leveraging WebAuthn's superior phishing protection. By showing transaction details before the TouchID prompt and cryptographically binding them to the signature, we create an auditable trail of user intent.

The fundamental challenge of malicious dApps exists across all wallet types. Our approach focuses on:
1. **Transparency**: Clear display of transaction details
2. **Integrity**: Cryptographic binding prevents tampering
3. **Auditability**: Verifiable record of what was signed
4. **Phishing Protection**: WebAuthn's origin scoping prevents domain spoofing

This makes passkey-based wallets at least as secure as traditional wallets, with better UX and phishing resistance.