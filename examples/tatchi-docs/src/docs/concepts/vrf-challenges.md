# VRF‑Backed WebAuthn Challenges

The SDK uses a VRF (in WASM) to construct WebAuthn challenges bound to user, origin, and session with NEAR block data for freshness and fork safety.

## Inputs (domain‑separated)

- Domain separator: `web3_authn_vrf_challenge_v1` (prevents cross‑protocol collisions)
- User id: binds to a specific user
- Session id: uniqueness per browser session
- Relying party id (origin): rpId pinning
- NEAR block height + hash: freshness and fork protection
- Optional timestamp: auditability and expiry

The VRF output becomes the WebAuthn challenge; the proof is verified alongside the WebAuthn response.

## Flows

- Registration: generate VRF keypair → encrypt and store
- Login: unlock VRF keypair in worker memory via PRF or Shamir 3‑pass
- Auth: generate VRF challenge (no extra TouchID) → run WebAuthn ceremony

## Security properties

- Domain separation and user/session binding ensure uniqueness
- Origin binding via rpId prevents cross‑origin reuse
- Freshness and fork protection via latest block height/hash
- VRF proof verified on‑chain alongside WebAuthn response
- VRF private key stays in WASM worker memory

## Notes

- Session ends when the tab/window closes; re‑authenticate to unlock VRF again
- See also: VRF & PRF (overview), Shamir 3‑pass (optional unlock optimization)

Read next: [Shamir3Pass](/docs/concepts/shamir3pass)
