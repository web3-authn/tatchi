**Global Contracts – SDK / WASM Signer Worker Implementation Plan**

- Goal: Add first‑class support for NEP‑0591 Global Contracts in the Web3Authn SDK transaction flow, so the WASM signer worker can sign transactions containing `DeployGlobalContract` and `UseGlobalContract` actions.
- Scope: Changes are confined to the SDK (`sdk/`) and the Rust WASM signer worker crate (`sdk/src/wasm_signer_worker`), reusing the existing `signTransactionsWithActions` flow. Contract code (`email-recoverer`) and CLI tooling are already handled elsewhere.

**References**
- NEP‑0591 Global Contracts spec.
- `@near-js/transactions` v2.4.0 global contract types:
  - `GlobalContractDeployMode`, `GlobalContractIdentifier`
  - `DeployGlobalContract`, `UseGlobalContract`
  - `action_creators.deployGlobalContract`, `action_creators.useGlobalContract`

---

## 1. Data Model Changes in WASM Signer Worker (Rust)

**1.1 Extend NEAR core types**

Files (Rust crate under `sdk/src/wasm_signer_worker`):
- `sdk/src/wasm_signer_worker/src/types/near.rs`

Tasks:

- Add NEP‑0591 enums to mirror `@near-js/transactions`:

  ```rust
  #[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub enum GlobalContractDeployMode {
      CodeHash,
      AccountId,
  }

  #[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub enum GlobalContractIdentifier {
      CodeHash(CryptoHash),   // 32‑byte code hash
      AccountId(AccountId),   // owner account ID
  }
  ```

- Extend the internal `Action` enum with global‑contract actions:

  ```rust
  #[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub enum Action {
      CreateAccount,
      DeployContract { #[serde(with = "serde_bytes")] code: Vec<u8> },
      FunctionCall(Box<FunctionCallAction>),
      Transfer { deposit: Balance },
      Stake { stake: Balance, public_key: PublicKey },
      AddKey { public_key: PublicKey, access_key: AccessKey },
      DeleteKey { public_key: PublicKey },
      DeleteAccount { beneficiary_id: AccountId },
      DeployGlobalContract {
          #[serde(with = "serde_bytes")]
          code: Vec<u8>,
          deploy_mode: GlobalContractDeployMode,
      },
      UseGlobalContract {
          contract_identifier: GlobalContractIdentifier,
      },
  }
  ```

- Ensure Borsh layout matches near‑primitives:
  - Fields and variant order should mirror the protocol (use `@near-js/transactions` as a reference when validating serialized bytes).
  - Add unit tests that:
    - Create `Action::DeployGlobalContract` and `Action::UseGlobalContract` values.
    - Borsh‑serialize them and compare against bytes produced by `@near-js/transactions` for the same actions.

---

**1.2 Extend `ActionParams` JSON schema**

Files (Rust crate under `sdk/src/wasm_signer_worker`):
- `sdk/src/wasm_signer_worker/src/actions.rs`

Tasks:

- Extend `ActionParams` enum (JSON representation coming from TS) with two new variants:

  ```rust
  #[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
  #[serde(tag = "action_type")]
  pub enum ActionParams {
      CreateAccount,
      DeployContract { code: Vec<u8> },
      FunctionCall { method_name: String, args: String, gas: String, deposit: String },
      Transfer { deposit: String },
      Stake { stake: String, public_key: String },
      AddKey { public_key: String, access_key: String },
      DeleteKey { public_key: String },
      DeleteAccount { beneficiary_id: String },
      // New: NEP‑0591 actions
      DeployGlobalContract {
          code: Vec<u8>,
          // "CodeHash" | "AccountId" (same strings as ActionType / TS side)
          deploy_mode: String,
      },
      UseGlobalContract {
          // Exactly one of these must be set by TS side
          account_id: Option<String>,
          code_hash: Option<String>, // bs58 string or 32‑byte hex; see TS mapping
      },
  }
  ```

- Extend `ActionType` enum used internally in `actions.rs` with:

  ```rust
  pub enum ActionType {
      CreateAccount,
      DeployContract,
      FunctionCall,
      Transfer,
      Stake,
      AddKey,
      DeleteKey,
      DeleteAccount,
      DeployGlobalContract,
      UseGlobalContract,
  }
  ```

---

**1.3 Add action handlers for global contracts**

Files (Rust crate under `sdk/src/wasm_signer_worker`):
- `sdk/src/wasm_signer_worker/src/actions.rs`

Tasks:

- Implement `DeployGlobalContractActionHandler` and `UseGlobalContractActionHandler` analogous to existing handlers:

  ```rust
  pub struct DeployGlobalContractActionHandler;
  pub struct UseGlobalContractActionHandler;
  ```

- Validation rules:

  - `DeployGlobalContract`:
    - `code` must be non‑empty.
    - `deploy_mode` must be `"CodeHash"` or `"AccountId"`; anything else returns a clear error.
  - `UseGlobalContract`:
    - Exactly one of `account_id` or `code_hash` must be present (not both).
    - If `account_id` is set: validate as `AccountId::from_str`.
    - If `code_hash` is set:
      - Decide on encoding (recommend: base58 string matching `@near-js/transactions` `CodeHash`).
      - Decode to 32‑byte array, then to `CryptoHash`.

- Build logic:

  - `DeployGlobalContractActionHandler::build_action`:

    ```rust
    fn build_action(&self, params: &ActionParams) -> Result<Action, String> {
        if let ActionParams::DeployGlobalContract { code, deploy_mode } = params {
            let mode = match deploy_mode.as_str() {
                "CodeHash" => GlobalContractDeployMode::CodeHash,
                "AccountId" => GlobalContractDeployMode::AccountId,
                other => return Err(format!("Invalid deploy_mode: {}", other)),
            };
            Ok(Action::DeployGlobalContract {
                code: code.clone(),
                deploy_mode: mode,
            })
        } else {
            Err("Invalid params for DeployGlobalContract action".to_string())
        }
    }
    ```

  - `UseGlobalContractActionHandler::build_action`:

    ```rust
    fn build_action(&self, params: &ActionParams) -> Result<Action, String> {
        if let ActionParams::UseGlobalContract { account_id, code_hash } = params {
            let identifier = match (account_id, code_hash) {
                (Some(id), None) => {
                    let acc = id.parse::<AccountId>()
                        .map_err(|e| format!("Invalid account_id: {}", e))?;
                    GlobalContractIdentifier::AccountId(acc)
                }
                (None, Some(hash_str)) => {
                    // Assuming base58 encoding for consistency with JS
                    let bytes = bs58::decode(hash_str)
                        .into_vec()
                        .map_err(|e| format!("Invalid code_hash: {}", e))?;
                    if bytes.len() != 32 {
                        return Err("code_hash must be 32 bytes".to_string());
                    }
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    GlobalContractIdentifier::CodeHash(CryptoHash::from_bytes(arr))
                }
                _ => {
                    return Err("UseGlobalContract requires exactly one of account_id or code_hash".to_string());
                }
            };

            Ok(Action::UseGlobalContract { contract_identifier: identifier })
        } else {
            Err("Invalid params for UseGlobalContract action".to_string())
        }
    }
    ```

- Wire handlers into `get_action_handler`:

  ```rust
  pub fn get_action_handler(params: &ActionParams) -> Result<Box<dyn ActionHandler>, String> {
      match params {
          ActionParams::FunctionCall { .. } => Ok(Box::new(FunctionCallActionHandler)),
          ActionParams::Transfer { .. } => Ok(Box::new(TransferActionHandler)),
          ActionParams::CreateAccount => Ok(Box::new(CreateAccountActionHandler)),
          ActionParams::DeployContract { .. } => Ok(Box::new(DeployContractActionHandler)),
          ActionParams::Stake { .. } => Ok(Box::new(StakeActionHandler)),
          ActionParams::AddKey { .. } => Ok(Box::new(AddKeyActionHandler)),
          ActionParams::DeleteKey { .. } => Ok(Box::new(DeleteKeyActionHandler)),
          ActionParams::DeleteAccount { .. } => Ok(Box::new(DeleteAccountActionHandler)),
          ActionParams::DeployGlobalContract { .. } => Ok(Box::new(DeployGlobalContractActionHandler)),
          ActionParams::UseGlobalContract { .. } => Ok(Box::new(UseGlobalContractActionHandler)),
      }
  }
  ```

---

**1.4. Confirmation / digest handling (UI summary)**

Files (Rust crate under `sdk/src/wasm_signer_worker`):
- `sdk/src/wasm_signer_worker/src/handlers/confirm_tx_details.rs`

Tasks:

- Extend any match statements that compute:
  - Total attached deposit.
  - Human‑readable summaries of actions.

Guidelines:

- Treat both `DeployGlobalContract` and `UseGlobalContract` as **0 deposit** actions (storage cost is internal to the protocol, not an attached deposit).
- For confirmation UI summaries:
  - `DeployGlobalContract`: show something like “Deploy global contract (mode: CodeHash/AccountId, code size: N bytes)”.
  - `UseGlobalContract`: show “Use global contract by accountId: X” or “Use global contract by hash: <shortened hash>”.
- Ensure the `intentDigest` covers the new action shapes exactly as encoded in `ActionParams[]` so the UI and WASM see the same payload.

---

## 2. TypeScript SDK Wiring for Global Actions

Although the WASM signer worker is the source of truth for NEAR actions, we need matching TS types in the SDK so apps can request global‑contract actions.

Files (SDK package under `sdk/src`):
- `sdk/src/core/types/actions.ts`
- `sdk/src/core/WebAuthnManager/LitComponents/common/tx-digest.ts`
- Any call sites that construct `ActionArgs` for deploy flows (e.g. `sdk/src/server/core/AuthService.ts`, `sdk/src/core/rpcCalls.ts`, `sdk/src/core/TatchiPasskey/*.ts` helpers).

**2.1 Extend `ActionType` and action unions**

In `core/types/actions.ts`:

- Extend `ActionType`:

  ```ts
  export enum ActionType {
    CreateAccount = "CreateAccount",
    DeployContract = "DeployContract",
    FunctionCall = "FunctionCall",
    Transfer = "Transfer",
    Stake = "Stake",
    AddKey = "AddKey",
    DeleteKey = "DeleteKey",
    DeleteAccount = "DeleteAccount",
    DeployGlobalContract = "DeployGlobalContract",
    UseGlobalContract = "UseGlobalContract",
  }
  ```

- Add JS‑side action interfaces:

  ```ts
  export interface DeployGlobalContractAction {
    type: ActionType.DeployGlobalContract;
    code: Uint8Array | string;
    // "CodeHash" | "AccountId"
    deployMode: 'CodeHash' | 'AccountId';
  }

  export interface UseGlobalContractAction {
    type: ActionType.UseGlobalContract;
    // Exactly one of these should be set
    accountId?: string;
    // bs58‑encoded code hash
    codeHash?: string;
  }

  export type ActionArgs =
    | FunctionCallAction
    | TransferAction
    | CreateAccountAction
    | DeployContractAction
    | StakeAction
    | AddKeyAction
    | DeleteKeyAction
    | DeleteAccountAction
    | DeployGlobalContractAction
    | UseGlobalContractAction;
  ```

- Extend `ActionArgsWasm` to mirror the Rust `ActionParams` layout:

  ```ts
  export type ActionArgsWasm =
    | { action_type: ActionType.CreateAccount }
    | { action_type: ActionType.DeployContract; code: number[] }
    | { action_type: ActionType.DeployGlobalContract; code: number[]; deploy_mode: 'CodeHash' | 'AccountId' }
    | {
        action_type: ActionType.FunctionCall;
        method_name: string;
        args: string;
        gas: string;
        deposit: string;
      }
    | { action_type: ActionType.Transfer; deposit: string }
    | { action_type: ActionType.Stake; stake: string; public_key: string }
    | { action_type: ActionType.AddKey; public_key: string; access_key: string }
    | { action_type: ActionType.DeleteKey; public_key: string }
    | { action_type: ActionType.DeleteAccount; beneficiary_id: string }
    | { action_type: ActionType.UseGlobalContract; account_id?: string; code_hash?: string };
  ```

**2.2 Mapping JS ↔ WASM action shapes**

- Update `toActionArgsWasm(action: ActionArgs): ActionArgsWasm` to handle the two new cases:

  ```ts
  case ActionType.DeployGlobalContract:
    return {
      action_type: ActionType.DeployGlobalContract,
      code: typeof action.code === 'string'
        ? Array.from(new TextEncoder().encode(action.code))
        : Array.from(action.code),
      deploy_mode: action.deployMode,
    };

  case ActionType.UseGlobalContract:
    return {
      action_type: ActionType.UseGlobalContract,
      account_id: action.accountId,
      code_hash: action.codeHash,
    };
  ```

- Update `validateActionArgsWasm`:
  - `DeployGlobalContract`: ensure `code` is present and non‑empty; `deploy_mode` is `"CodeHash"` or `"AccountId"`.
  - `UseGlobalContract`: ensure exactly one of `account_id` or `code_hash` is set.

- Update `fromActionArgsWasm`:
  - Convert `DeployGlobalContract` back into `DeployGlobalContractAction`.
  - Convert `UseGlobalContract` back into `UseGlobalContractAction`.

**2.3 Confirmation UI / digest**

Files:
- `sdk/src/core/WebAuthnManager/LitComponents/common/tx-digest.ts`

Tasks:

- Extend switch over `action_type` to include:

  ```ts
  case ActionType.DeployGlobalContract:
    return { action_type: a.action_type, deploy_mode: a.deploy_mode, code_len: a.code?.length ?? 0 };
  case ActionType.UseGlobalContract:
    return { action_type: a.action_type, account_id: a.account_id, code_hash: a.code_hash };
  ```

- This ensures the digest covers global actions and the UI can render simple summaries.

---

## 3. How Apps Use Global Contract Actions via SDK

With the above wiring in place, client code can request global‑contract operations using the existing `signTransactionsWithActions` path by constructing `ActionArgs` that include global actions:

```ts
// Example: user attaches a global email-recoverer contract and initializes it
const tx = {
  receiverId: userAccountId, // e.g. "bob.near"
  actions: [
    {
      type: ActionType.UseGlobalContract,
      accountId: GLOBAL_EMAIL_RECOVERER_ACCOUNT_ID,
    },
    {
      type: ActionType.FunctionCall,
      methodName: "new",
      args: {
        zk_email_verifier: "zk-email-verifier.testnet",
        email_dkim_verifier: "email-dkim-verifier.testnet",
        policy: null,
        recovery_emails: [],
      },
      gas: "80000000000000",
      deposit: "0",
    },
  ],
};
```

The SDK will:

- Convert these to `ActionArgsWasm` and then to Rust `ActionParams`.
- Build proper NEP‑0591 `DeployGlobalContract` / `UseGlobalContract` `Action`s in the wasm‑signer‑worker.
- Sign the resulting transaction with the user’s WebAuthn‑backed keypair, just like for existing actions.

---

## 4. Validation & Testing

**Unit tests (Rust – WASM signer worker)**

- Add tests in `sdk/src/wasm_signer_worker/src/tests/actions_tests.rs`:
  - Validate `DeployGlobalContractActionHandler` and `UseGlobalContractActionHandler`:
    - Reject invalid `deploy_mode`.
    - Reject missing/duplicate `account_id` / `code_hash`.
  - Ensure `build_action` produces `Action::DeployGlobalContract` / `Action::UseGlobalContract` with expected fields.

- Add serialization parity tests:
  - For a fixed `DeployGlobalContract` and `UseGlobalContract` action, compare Borsh bytes to those from `@near-js/transactions` for the same action payload (using a small helper script).

**Unit tests (TS – SDK)**

- Extend `core/types/actions.spec.ts` (or equivalent) to:
  - Validate `toActionArgsWasm` / `fromActionArgsWasm` round‑trip for new action types.
  - Validate `validateActionArgsWasm` error paths (e.g. both `account_id` and `code_hash` provided).

**Integration tests**

- Add a small end‑to‑end test that:
  - Builds a transaction with `UseGlobalContract + FunctionCall(new)` for a dummy contract.
  - Passes it through `signTransactionsWithActions`.
  - Asserts that:
    - The signed transaction contains the expected action sequence when decoded.
    - The signer worker progress events still flow correctly.
