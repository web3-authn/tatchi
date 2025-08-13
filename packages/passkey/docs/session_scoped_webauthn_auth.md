# Session-Scoped WebAuthn Authorization with VRF Challenges

## Overview

Enable a single WebAuthn biometric attestation (e.g., TouchID) to unlock a **bounded session** for executing multiple smart contract actions without re-prompting the user for each one.

Session scope is securely derived from a VRF-based challenge and verified WebAuthn signature, providing:
- A seamless UX
- Biometric device binding
- Cryptographic session proof

### Current Problem
- Each contract call requires separate PRF authentication (TouchID)
- Poor UX for multi-step operations (DeFi, batch transactions)
- No session management for authenticated operations

### Solution
A session-based architecture where:
1. **Single TouchID** creates a PRF session
2. **Multiple contract calls** reuse the same PRF output
3. **Configurable policies** control session behavior
4. **Security boundaries** prevent misuse

---

## Use Cases

- Signing multiple transactions (e.g., batch transfers)
- Authorizing contract calls under a temporary or function-scoped session
- Improving UX without sacrificing cryptographic guarantees

---

## Design Overview

1. Client decrypts a **VRF secret key** inside a WASM worker using WebAuthn PRF.
2. Generates a **VRF challenge** using a recent block hash.
3. Signs the VRF output using WebAuthn.
4. Submits session request to contract, which:
   - Verifies the WebAuthn signature
   - Verifies the VRF proof
   - Stores session scope (duration, count, function allowlist, etc.)

5. Subsequent transactions during the session:
   - Refer to the session ID
   - Must originate from the same account/device
   - Are authorized based on constraints

---

## Security Assumptions and Tradeoffs

| Assumption | Justification |
|------------|---------------|
| VRF key is decrypted only inside WASM worker | Isolates key from main thread/JS tampering |
| Session scope is limited (N calls, T ms) | Prevents abuse from stolen session tokens |
| Client has incentive not to cheat | User is authorizing on their own behalf |
| WebAuthn PRF output is unique per device & biometric | Prevents spoofing or offline replay |

**Tradeoffs:**
- Reusing VRF challenge in a session **removes freshness guarantees per tx**
- If client tampers with WASM, they can forge session start (but only for themselves)
- On-chain state needed to track session expiration, limits


## Architecture

### Core Components

#### 1. PRFSession Class
```typescript
class PRFSession {
  private prfOutput: ArrayBuffer;        // Encrypted PRF output
  private username: string;              // Session owner
  private expiresAt: number;             // Session expiration
  private allowedMethods: Set<string>;   // Whitelisted methods
  private usageCount: number;            // Call counter
  private maxUsage: number;              // Usage limit

  canExecute(methodName: string): boolean;
  executeContractCall(...): Promise<FinalExecutionOutcome>;
}
```

#### 2. Session Configuration
```typescript
interface PRFSessionConfig {
  ttlMs: number;                    // Time-to-live
  maxUsage: number;                 // Max calls per session
  allowedMethods: string[];         // Method whitelist
  requiresReauth?: string[];        // Methods needing fresh auth
  autoRefresh?: boolean;            // Auto-renew capability
}
```

#### 3. Enhanced PasskeyManager
```typescript
class PasskeyManager {
  private prfSessions: Map<string, PRFSession>;

  createPRFSession(username, config): Promise<PRFSession>;
  executeBatchWithPRF(username, calls[]): Promise<Results[]>;
}
```

### Predefined Session Types

#### TRANSACTION_BATCH
- **Duration**: 1 minutes
- **Max Usage**: 5 calls
- **Allowed Methods**: `transfer`, `call_contract`, `stake`
- **Use Case**: DeFi operations, batch transactions

#### ADMIN_SESSION
- **Duration**: 10 minutes
- **Max Usage**: 50 calls
- **Allowed Methods**: All methods
- **Sensitive Methods**: Require re-authentication
- **Use Case**: Administrative operations
