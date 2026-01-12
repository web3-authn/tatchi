---
title: Threshold Signing
---

# Threshold Signing

Tatchi supports **2-of-2 threshold Ed25519 signing** (client + relayer) using a FROST-style two-round protocol. Instead of one NEAR private key living on the device or the server, the signing key is split into two shares:

- **Client share**: derived deterministically inside the signer worker from `WrapKeySeed` (from WebAuthn PRF) + `nearAccountId`.
- **Relayer share**: held by the relay (either persisted in a key store, or derived on-demand from a 32‑byte master secret).

The NEAR account adds the **threshold group public key** as an access key. From that point on, any transaction signed with this key requires *both* the client and the relayer to participate.

## Key Material

### Client share (deterministic)

The client share is derived from `WrapKeySeed` inside the signer worker and never leaves the worker boundary. The share is deterministic per `(nearAccountId, WrapKeySeed)` so the wallet can re-derive it on-demand during a signing session.

### Relayer share modes

The relay can operate in one of two modes:

- **`kv` mode**: `/threshold-ed25519/keygen` generates a random relayer signing share and persists it (Redis/Upstash/in-memory).
- **`derived` mode**: the relay derives its share on-demand from `THRESHOLD_ED25519_MASTER_SECRET_B64U` + `(nearAccountId, rpId, clientVerifyingShareB64u)` and stores nothing long-lived.
- **`auto` mode**: uses derived mode when `THRESHOLD_ED25519_MASTER_SECRET_B64U` is present; otherwise behaves like `kv`.

## Enrollment Flow

Threshold enrollment is intended to run *after* the passkey is registered on-chain. It does two things:

1. Registers the relayer as the co-signer for this account/device (`/threshold-ed25519/keygen`).
2. Activates the returned group public key on-chain via `AddKey(groupPk)` (signed locally).

```mermaid
sequenceDiagram
  participant App as Wallet (iframe UI)
  participant VRF as VRF Worker
  participant Signer as Signer Worker
  participant Relay as Relayer
  participant NEAR as NEAR RPC

  Note over App,Signer: 1) Derive client verifying share from WrapKeySeed
  App->>Signer: deriveThresholdEd25519ClientVerifyingShare(sessionId, nearAccountId)
  Signer-->>App: clientVerifyingShareB64u + wrapKeySalt

  Note over App,VRF: 2) Build VRF challenge bound to keygen intent
  App->>NEAR: viewBlock(final)
  NEAR-->>App: blockHeight + blockHash
  App->>VRF: generateVrfChallengeOnce(intentDigest=keygenIntent)
  VRF-->>App: vrfChallenge
  App->>App: WebAuthn get() using vrfChallenge as challenge

  Note over App,Relay: 3) Keygen on relay (WebAuthn+VRF verified)
  App->>Relay: POST /threshold-ed25519/keygen
  Relay-->>App: publicKey=groupPk, relayerKeyId, relayerVerifyingShareB64u

  Note over App,NEAR: 4) Activate groupPk on-chain
  App->>Signer: sign AddKey(groupPk) (no extra prompt)
  Signer-->>App: signedTx(AddKey)
  App->>NEAR: sendTransaction(AddKey)
```

At the end of enrollment the client stores a local `threshold_ed25519_2p_v1` record (group public key + `relayerKeyId` + `wrapKeySalt`).

## Signing Flow

Threshold signing is used whenever the SDK chooses `signerMode: 'threshold-signer'` and threshold key material exists for the current device/account.

At a high level:

1. The VRF/confirmation flow produces a fresh `intentDigest`, `transactionContext` (nonce/block hash), and (when needed) a WebAuthn assertion.
2. The signer worker derives the client signing share from `WrapKeySeed`, runs 2-round FROST with the relayer, and aggregates the final Ed25519 signature.

```mermaid
sequenceDiagram
  participant App as Wallet (iframe UI)
  participant VRF as VRF Worker
  participant Signer as Signer Worker
  participant Relay as Relayer (coordinator)

  Note over App,VRF: 1) Confirm + VRF/WebAuthn (freshness + user presence)
  App->>VRF: confirmAndPrepareSigningSession(intent)
  VRF-->>Signer: MessagePort: WrapKeySeed + wrapKeySalt
  VRF-->>App: intentDigest, transactionContext, vrfChallenge?, credential?

  Note over Signer,Relay: 2) Authorize digest + payload on relay
  Signer->>Relay: POST /threshold-ed25519/authorize (or via session token)
  Relay-->>Signer: mpcSessionId

  Note over Signer,Relay: 3) FROST round 1 (commitments)
  Signer->>Relay: POST /threshold-ed25519/sign/init (mpcSessionId + clientCommitments)
  Relay-->>Signer: signingSessionId, commitmentsById, relayerVerifyingSharesById, participantIds

  Note over Signer,Relay: 4) FROST round 2 (signature shares)
  Signer->>Relay: POST /threshold-ed25519/sign/finalize (clientSignatureShareB64u)
  Relay-->>Signer: relayerSignatureSharesById
  Signer->>Signer: aggregate(clientShare, relayerSharesById) => Ed25519 signature
```

## Troubleshooting

- If `/threshold-ed25519/sign/*` returns `404` with `threshold-ed25519 signing endpoints are not enabled on this server`, ensure you are calling a relayer configured as the **coordinator** (`THRESHOLD_NODE_ROLE=coordinator`).

## Extending to 3+ parties

The signing APIs and transcript types are already keyed by **participant id** (`commitmentsById`, `relayerVerifyingSharesById`, `relayerSignatureSharesById`). This means adding more relayer participants does not require changing the client-facing endpoints.

In a multi-relayer setup:
- The wallet always talks to a **single coordinator relayer** (`THRESHOLD_NODE_ROLE=coordinator`) for `/threshold-ed25519/sign/*`.
- The coordinator fans out to **cosigner relayers** (`THRESHOLD_NODE_ROLE=cosigner`) via internal endpoints (`/threshold-ed25519/internal/cosign/*`) authenticated by a per-signature coordinator grant (`THRESHOLD_COORDINATOR_SHARED_SECRET_B64U`).
- Moving to true 3+ party signing also requires a multi-party key setup (e.g. DKG/dealer-split) and on-chain rotation to the new group public key.

## Protocol Math

This section describes the *math* behind the 2-of-2 FROST-style Ed25519 scheme implemented in the signer worker (client) and relayer (server).

Notation:
- Scalars live in the Ed25519 scalar field `𝔽_ℓ` (mod the curve order `ℓ`).
- `G` is the Ed25519 basepoint.
- Participant identifiers are configurable; the defaults are `x₁ = 1` (client) and `x₂ = 2` (relayer). The worked example below assumes `{1,2}`.

### Keygen Math

The system uses a “scaffolding” keygen (not a full DKG): each party has a long-lived scalar share, and the *group secret* is the Lagrange interpolation at `x=0` of the 2-point polynomial through those shares.

1. Client derives its signing share scalar `s₁` deterministically from `WrapKeySeed` and `nearAccountId` via HKDF, then computes its verifying share `V₁ = s₁·G`.
2. Relayer chooses/derives its signing share scalar `s₂`, then computes its verifying share `V₂ = s₂·G`.

Given the signer set `{1,2}` (default ids), the Lagrange coefficients at `x=0` are:
- `λ₁ = 2`
- `λ₂ = −1`

So the (never-materialized) group secret scalar is:

`s = λ₁·s₁ + λ₂·s₂ = 2s₁ − s₂  (mod ℓ)`

And the on-chain public key is:

`Y = s·G = 2V₁ − V₂`

(For non-default participant ids, the Lagrange coefficients change; the implementation computes them from the configured participant ids.)


### Signing Math (Two-Round FROST)

Threshold signing produces a standard 64-byte Ed25519 signature `(R, z)` that verifies with:

`z·G = R + c·Y`

where `c = H(R, Y, m)` and `m` is the 32-byte signing digest (the SDK always signs digests, not raw transactions).

**Round 1 (commitments):**

Each party samples two fresh random nonces `(dᵢ, eᵢ)` and publishes two nonce commitments:
- `Dᵢ = dᵢ·G` (hiding)
- `Eᵢ = eᵢ·G` (binding)

**Round 2 (signature shares):**

The coordinator computes binding factors `ρᵢ = H(i, m, all commitments)` and the group commitment:

`R = Σ (Dᵢ + ρᵢ·Eᵢ)`

Then each party returns a signature share:

`zᵢ = dᵢ + ρᵢ·eᵢ + λᵢ·sᵢ·c   (mod ℓ)`

Finally the coordinator aggregates:

`z = Σ zᵢ  (mod ℓ)`

and returns `(R, z)`.


## Threshold Sessions

To avoid running `/authorize` with WebAuthn+VRF on every signature, the SDK can mint a short-lived, limited-use threshold session:

- Client calls `POST /threshold-ed25519/session` once (usually during login), passing a **session policy** `{ ttlMs, remainingUses }` and a VRF proof that includes `session_policy_digest_32`.
- The relayer stores the session server-side and returns a JWT (or sets an HttpOnly cookie).
- Subsequent `/authorize` calls can use the session token instead of a fresh WebAuthn assertion.

The session policy is validated server-side (TTL caps + use count caps) and is *cryptographically bound* into the VRF challenge to prevent policy tampering.
