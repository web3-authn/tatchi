# Web4 Hosting Contract Specification

## Overview
We need a NEAR smart contract written in Rust that implements the `web4` standard (specifically `web4_get`). This contract will serve as the on-chain registry for our wallet UI and SDK assets, which are stored on NEARFS (IPFS).

## Requirements

### 1. Interface
The contract must implement a single view function:
```rust
pub fn web4_get(&self, request: Web4Request) -> Web4Response
```

### 2. State Storage
The contract needs to store:
- **Static Mapping**: A map of URL paths to NEARFS content hashes (CIDs).
- **Manifest**: A JSON string or object containing the full release manifest (hashes of all files).

### 3. Routing Logic (`web4_get`)
The function should handle GET requests as follows:

1.  **Root and Wallet UI**:
    - Requests for `/`, `/index.html`, or any path starting with `/wallet/` that doesn't match a specific file should serve the `index.html` from the Wallet UI build.
    - This supports client-side routing (SPA behavior).

2.  **Static Assets**:
    - Requests for specific files (e.g., `/assets/index.js`, `/sdk/webauthn.js`) should return a `Web4Response::BodyUrl` pointing to the corresponding NEARFS URL (`ipfs://<cid>`).
    - The mapping of `path -> cid` is updated via a contract call (see Management).

3.  **Manifest**:
    - Request for `/manifest.json` should return the stored JSON manifest directly (`Web4Response::Body`).

### 4. Management (Update)
The contract needs a method to update the static mapping and manifest.
- **Method**: `web4_setStaticUrl(path: String, cid: String)` or a batch update method.
- **Access Control**: Only the contract owner (or a specific access key) can call this.
- **Note**: `web4-deploy` typically expects a specific interface or we can write a custom setter. A simple `update_routes(routes: Map<String, String>, manifest: String)` is preferred.

## Prompts for Contract Engineer

### Prompt 1: Scaffolding
> "Create a new NEAR smart contract in Rust called `web4-hosting`. It should depend on `near-sdk` and `web4`. Please set up the basic `lib.rs` structure with a `Contract` struct and the `web4_get` view function signature. Also include a `update_routes` method that takes a map of paths to IPFS CIDs and stores them in a `LookupMap`."

### Prompt 2: Implementing `web4_get`
> "Implement the `web4_get` function. It should take a `Web4Request` (path, method, etc.).
> 1. If the path is `/manifest.json`, return the stored manifest JSON string with content type `application/json`.
> 2. If the path exists in our `routes` map, return a `Web4Response::BodyUrl` pointing to `ipfs://<cid>`.
> 3. If the path starts with `/wallet/` or is `/`, and no exact file match is found, return the `BodyUrl` for `index.html` (SPA fallback).
> 4. Otherwise, return 404."

### Prompt 3: Management & Security
> "Implement the `update_routes` function. It should accept a list of path-to-CID pairs and a `manifest` string. It should update the contract's state. Ensure that `env::predecessor_account_id()` is the contract owner (or `env::current_account_id()`) to prevent unauthorized updates."
