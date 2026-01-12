# Distributed Key Generation (DKG) Plan (Relayer Fleet / internal t-of-n)

This document proposes how we should run key setup between multiple relayer servers (“relayer cosigners”) so they can jointly hold the **logical relayer participant’s** long-lived signing material (internal `t-of-n`), while the client-facing signer set remains **2-party** (client + logical relayer).

## Why this exists

For 3P+ resilience, we want a relayer fleet that is **all operated by us**, but with:

- **different keys/shares** (so one compromised relayer doesn’t immediately yield the full signing key), and
- optionally **different hosting** (e.g. different cloud providers / regions) for availability.

That still requires a coordinated key setup:

- If each relayer “just derives a share from its own secret”, the resulting shares will **not** correspond to the *same logical relayer participant* (i.e. a single `relayerVerifyingShare` used in the outer 2-party protocol).
- We need either:
  - a **dealer** that creates shares for everyone, or
  - a **DKG** ceremony where relayers jointly generate the key without any single party learning it.

Near-term decision: ship **dealer-split deterministic shares** for restart robustness / stateless relayer deployments.

Long-term target: add a true **DKG** ceremony so no single internal service can derive all shares.

## Terms

- **Outer participant**: a party in the client-facing FROST protocol, identified by `participantId` (typically a `u16`).
- **Logical relayer participant**: the single *outer* participant representing the relayer fleet (usually `participantId=2`).
- **Relayer cosigner**: an internal relayer node holding a share of the logical relayer participant’s signing material (internal `t-of-n`).
- **Cosigner set / threshold**: `t-of-n` across relayer cosigners that must collaborate to produce the logical relayer participant’s outputs.
- **Logical relayer verifying share**: the Ed25519 point corresponding to the logical relayer participant’s secret share (`relayerVerifyingShare`).
- **Outer group public key**: derived from the outer verifying shares (client + logical relayer) and becomes the NEAR access key.

## Dealer-split vs DKG vs Hybrid (what changes)

### 1) Dealer-split (trusted ceremony)

**What it is**
- One entity (“dealer”) chooses the logical relayer participant’s secret value and produces a cosigner share for each relayer cosigner.
- Dealer securely distributes each cosigner’s share.

**Properties**
- ✅ simplest to implement and reason about
- ✅ easy to run as an offline “ceremony” (one-time)
- ❌ dealer learns the full secret (or can reconstruct it) → dealer compromise is catastrophic
- ❌ share distribution must be secure (confidential + authenticated)

**When it’s useful**
- local/dev, early production pilots, or when stateless relayer nodes (re-derivable shares) are more important than dealer trust.

### 2) DKG (no trusted dealer)

**What it is**
- Relayer cosigners run an interactive protocol where each contributes randomness.
- The resulting logical relayer secret is never known to any single cosigner; each cosigner ends with its own signing share.
- The logical relayer verifying share is derived from the joint public commitments.

**Properties**
- ✅ no single dealer learns the secret
- ✅ better fit even in a single-operator deployment (reduces “one internal service can mint all shares” risk)
- ❌ more complexity (multi-round protocol, state management, reliable messaging)
- ❌ requires strong peer authentication and (usually) encryption of per-peer shares

**Operational note**
- A “fresh DKG run” typically yields a **new** logical relayer verifying share, so the outer group public key (and therefore the NEAR access key) will also change.
- Keeping the same on-chain public key while changing shares requires **proactive refresh / resharing** (future work).

### 3) Hybrid (common patterns)

“Hybrid” is overloaded; in this repo we mean one of:

1) **Dealer-split bootstrap → DKG/refresh later**: start with a dealer to ship quickly, then remove dealer trust by later resharing/refreshing without changing the public key (complex).
2) **Outer 2P + internal relayer DKG**: keep a client-held share deterministically derived from passkey PRF, while relayer cosigners run a dealer-split or DKG to generate/hold the logical relayer share. This keeps the *external* signer set as 2-party, while adding 3P+ resilience internally.
3) **Relayer-only key + client authorization**: relayers hold the full threshold key (via dealer-split or DKG), and the client is an authorization gate (WebAuthn/VRF/session). This is simpler but weakens the cryptographic guarantee if relayers collude.

## Proposed DKG plan (between relayer cosigners)

### Goals

- Generate relayer cosigner shares that correspond to a single logical relayer verifying share (`relayerVerifyingShare`) usable in the *outer* 2-party protocol.
- Support `n >= 2` relayer cosigners and `t <= n` (e.g. `t=2, n=2` initially; later `t=2, n=3`).
- Make the ceremony replay-safe, auditable, and restartable (persist intermediate state).
- Keep the ceremony transport-agnostic (works for “all-in-one” deployment and multi-service deployments).

### Non-goals (for this plan)

- Migration tooling / legacy compatibility (assume clean key rotation / re-enroll).
- Proactive refresh that preserves the same group public key.
- Expanding the external signer set beyond 2-party.

### Protocol choice

Start with Zcash Foundation FROST (`frost-ed25519`) DKG/keygen flows:

- Two-round DKG-style key generation (public commitments + encrypted shares).
- Produces per-cosigner key material and a public package that defines the logical relayer verifying share.

If we later need UC-secure/interactive alternatives, evaluate `givre` / `cggmp21-keygen`, but default to the audited ZF FROST stack.

### Ceremony orchestration model

We reuse the existing “coordinator/peer” shape from signing:

- **Coordinator relayer** orchestrates the DKG ceremony (state machine + fanout).
- **Peer relayers** participate and persist their own private state.

The coordinator is *not* a trusted dealer: it routes messages, enforces correctness and timeouts, and publishes results.

### Transport + security (required)

DKG requires strong peer identity and typically confidentiality for per-peer shares.

Minimum requirements:
- **Authentication** between coordinator and peer relayers (internal auth tokens; mTLS optional).
- **Confidentiality** for “share” messages (TLS is sufficient in our single-operator deployment; application-layer encryption is optional hardening).
- **Replay protection**: every ceremony is bound to a `ceremonyId` and has strict TTLs.

Suggested incremental path:
1) Local/dev: HTTP on localhost + fixed internal grant.
2) Production: TLS everywhere + coordinator-issued internal grants (current pattern).
3) Optional hardening: mTLS and/or application-layer encryption of share payloads.

### Data model + persistence

We store ceremony state in a coordinator-accessible KV (and optionally per-peer KV):

- `ceremonyId` (UUID)
- `cosignerIds` and `threshold t`
- Round 1 public commitments from each peer
- Round 2 encrypted shares (or per-peer responses)
- Final logical relayer verifying share (`relayerVerifyingShare`) and `cosignerVerifyingSharesById`
- Peer receipts: which relayers finalized successfully

Each peer also persists:
- its secret DKG package/state between rounds
- its final signing share material for the new `relayerKeyId` / logical relayer verifying share

### Statelessness and “derive shares from a master secret”

We should separate two ideas:

1) **Deterministic randomness for the DKG protocol** (good, helps restarts)
2) **Deterministically deriving the final long-lived signing share from a master secret** (generally *not* possible in a true DKG)

In a true DKG, each relayer’s final signing share depends on **private contributions from the other relayers** (the per-recipient shares they send you). Those private contributions are not recoverable from public commitments alone.

So:
- You *can* make the DKG ceremony robust to restarts by making each relayer’s internal randomness deterministic from a per-relayer master seed (and persisting the coordinator transcript so the relayer can resume).
- But you generally *cannot* “re-derive my final share later from only my master secret + public data” without either:
  - storing the final share (or an encrypted wrapper of it), or
  - storing the private incoming share messages (encrypted-to-you) so you can recompute the sum.

Recommended approach (single-operator fleet):
- Give each relayer cosigner a **per-cosigner KEK/master secret** (from env or KMS).
- After DKG completes, store the resulting signing share in a durable store **encrypted under that KEK**.
  - This keeps containers stateless across restarts while still being a real DKG (no dealer learns the full key).

Optional improvement:
- Use deterministic, per-ceremony RNG seeded from the relayer master secret:
  - `seed = HKDF(master_secret, info="threshold_ed25519_dkg_rng_v1" || ceremonyId || cosignerId || t || cosignerIdsHash)`
  - feed `seed` into a CSPRNG (e.g. ChaCha20Rng) for the DKG/keygen library
  - this makes “restart mid-ceremony” easy: rerun round computations and you get the same outbound messages.

If we truly require “no persistence of any kind”, then what we want is closer to **dealer-split / derived-share** (not DKG), and it comes with the dealer/root-secret trust tradeoffs described above.

### API sketch (server-to-server)

All endpoints are **internal** (not exposed to the browser).

Coordinator-facing:
- `POST /threshold-ed25519/dkg/start` → returns `ceremonyId` and requested `cosignerIds/t`
- `POST /threshold-ed25519/dkg/finalize` → returns `relayerVerifyingShare`, `cosignerVerifyingSharesById`, and a “ready” marker

Peer-facing (called by coordinator):
- `POST /threshold-ed25519/internal/dkg/round1` (start + return peer round1 public package)
- `POST /threshold-ed25519/internal/dkg/round2` (deliver the set of round1 packages + return peer round2 output)
- `POST /threshold-ed25519/internal/dkg/complete` (deliver final transcript + ask peer to persist final share)

### Step-by-step flow

1) **Start**
   - Coordinator chooses `ceremonyId`, `cosignerIds`, `t`, and TTL.
   - Coordinator fanouts `/internal/dkg/round1` to all peers.

2) **Round 1 (public commitments)**
   - Each peer generates round1 output:
     - public commitments/broadcast package (safe to share)
     - secret local state to carry into round2
   - Coordinator collects and validates:
     - correct cosigner ids
     - required fields present

3) **Round 2 (per-peer shares)**
   - Coordinator fanouts `/internal/dkg/round2` providing the full set of round1 packages.
   - Each peer returns its round2 output (often includes encrypted/per-peer share material).
   - Coordinator routes the required per-peer artifacts to the right peers (either by:
     - having peers return “messages for each recipient”, or
     - having coordinator act as mailbox keyed by `ceremonyId`).

4) **Completion**
   - Each peer derives:
     - its final signing share
     - the logical relayer verifying share / public package
   - Coordinator verifies:
     - all peers agree on the same logical relayer verifying share
     - verifying shares are consistent

5) **Publish + rotate**
   - Coordinator returns the logical relayer verifying share (`relayerVerifyingShare`) and metadata to the client-facing key enrollment flow.
   - Client computes the outer group public key (client verifying share + logical relayer verifying share) and rotates/adds the NEAR access key (clean switch).

### Failure handling

- Any peer timeout → ceremony abort (v1). Later: partial completion depending on protocol support.
- Any peer produces invalid output → abort and surface which peer failed.
- Coordinator restart → resume from KV (ceremony state is durable).

## Open questions (to decide before implementation)

- For the near-term dealer-split rollout: where does the dealer master secret live (KMS vs env), and how do relayers securely fetch only their own share on boot?
- When we add DKG later: do we keep dealer-split as a **dev-only** option for local testing?
- For DKG: where do relayers persist encrypted signing shares for restart robustness (KV vs local disk vs KMS-wrapped blob)?
- How do we map relayer-side DKG outputs into the outer 2-party `PublicKeyPackage` so the client can recompute the outer group public key deterministically from verifying shares?
- What is the canonical serialization for DKG messages (base64url + JSON, versioned)?
