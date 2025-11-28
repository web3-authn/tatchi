# Plan: Store Recovery Emails Locally (IndexedDB) While Keeping On‑Chain Hashes Only

## 1. Goals & Constraints

- Preserve privacy: on‑chain, store only salted SHA‑256 hashes of emails (`SHA256(canonical_email + "|" + account_id)`).
- Improve UX: on a given device, show human‑readable recovery emails instead of raw hashes when possible.
- Do not introduce any server‑side state; storage is **browser‑local** only.
- Support multiple NEAR accounts per browser/profile.

## 2. Data Model (Browser‑Local)

Per browser profile, maintain a small DB keyed by `accountId`:

- Store name: `recoveryEmails`
- Record shape (per account):
  ```ts
  type LocalRecoveryEmail = {
    hashHex: string;      // 0x… hex of the 32‑byte hash
    email: string;        // canonical_email: "local@domain", lowercased
    addedAt: number;      // ms since epoch
  };

  type RecoveryEmailsForAccount = {
    accountId: string;                // e.g. "alice.testnet"
    emails: LocalRecoveryEmail[];     // deduplicated by hashHex
    lastUpdatedAt: number;
  };
  ```

Notes:
- Store only canonical emails (no display names).
- Hash must be computed exactly as the contract expects; re‑use the existing `hashRecoveryEmails()` logic.

## 3. Storage Layer (IndexedDB Helper)

Create a small helper module in the docs/demo app (for example under `examples/tatchi-docs/src/storage/recoveryEmailsStore.ts`):

- Use a minimal IndexedDB wrapper (either `idb` or a tiny manual wrapper).
- API surface:
  ```ts
  async function getRecoveryEmails(accountId: string): Promise<RecoveryEmailsForAccount | null>;
  async function putRecoveryEmails(record: RecoveryEmailsForAccount): Promise<void>;
  async function upsertEmailsForAccount(
    accountId: string,
    entries: Array<{ hashHex: string; email: string }>
  ): Promise<void>;
  ```

Behavior:
- `upsertEmailsForAccount`:
  - Load existing record (if any).
  - Merge by `hashHex`, preferring the most recent `email` for duplicates.
  - Update `lastUpdatedAt`.

## 4. Write Path Integration (“Set Recovery Emails”)

In `SetupEmailRecovery.tsx`:

1. After computing `recoveryEmailHashes` and before/after calling the contract:
   - Build `[{ hashHex, email }]` pairs:
     - `hashHex = bytesToHex(hashBytes)` using the existing helper.
     - `email` = canonicalized email used for hashing.
2. Call:
   ```ts
   await upsertEmailsForAccount(nearAccountId, pairs);
   ```
3. Do **not** block the UI on this write (fire‑and‑forget with `void` if needed; swallow non‑critical errors with a console warning).

## 5. Read Path Integration (Display Panel)

The current implementation already:
- Fetches on‑chain hashes via `get_recovery_emails`.
- Recomputes hashes from the in‑memory `recoveryEmails` inputs to map hash → email.

Extend this logic to use IndexedDB as an additional source of truth:

1. On component mount (and when `nearAccountId` changes):
   - Load `localRecord = await getRecoveryEmails(nearAccountId)`.
2. When computing display labels from `rawOnChainHashes`:
   - Build a `localEmailByHashHex` map from both:
     - Current input emails (using `hashRecoveryEmails`).
     - `localRecord.emails`.
3. For each on‑chain hash:
   - `label = localEmailByHashHex[hashHex] ?? hashHex`.
   - Pass these labels into `EmailRecoveryFields` (as currently done).

This preserves the “best effort” behavior:
- Known emails on this device show as plaintext.
- Unknown hashes remain displayed as hex.

## 6. Edge Cases & UX Notes

- If a user clears browser data or switches devices, only hashes remain visible; this is expected.
- If emails are removed on‑chain (e.g. “Clear emails”), you may:
  - Optionally clear the IndexedDB entry for that `accountId`, or
  - Leave it as a local hint; on the next refresh, it just won’t match any on‑chain hashes.
- For now, keep the storage module demo‑only (under `examples/tatchi-docs`) and avoid exposing it as a public SDK API until the ergonomics are proven.

