# VRF‑Backed WebAuthn Challenges

The SDK uses a VRF (in WASM) to construct WebAuthn challenges bound to user, origin, and session with NEAR block data for freshness and fork safety.

## Inputs (domain‑separated)

- Domain separator: `web3_authn_vrf_challenge_v1`
- User id and session id
- Relying party id (origin)
- Latest NEAR block height + hash
- Optional timestamp

The VRF output becomes the WebAuthn challenge; the proof is verified alongside the WebAuthn response.

## Flows

- Registration: generate VRF keypair → encrypt and store
- Login: unlock VRF keypair in worker memory via PRF or Shamir 3‑pass
- Auth: generate VRF challenge (no extra TouchID) → run WebAuthn ceremony

## Security Properties

- Challenge uniqueness via domain separation and session binding
- Origin binding via rpId
- Freshness and fork protection via block height/hash
- VRF private key isolated in WASM worker memory

## Notes

- Session ends when the tab/window closes; re‑authenticate to unlock VRF again
- See also: VRF & PRF (high‑level), Shamir 3‑pass (optional unlock optimization)

