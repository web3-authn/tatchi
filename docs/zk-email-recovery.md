# ZK Email Recovery — Cloudflare Email Worker Plan

Goal: wire a Cloudflare Email Worker that receives password‑reset / recovery emails (for example, `reset@web3authn.org`), parses them into JSON (including DKIM‑related headers), and forwards them to the existing Cloudflare Relay Worker at an HTTP endpoint such as `/reset-email`. The Email Worker stays “dumb” (no keys, no ZK); the Relay Worker + prover infrastructure handle DKIM verification, zk‑email proofs, and NEAR transactions.

## 1. Install Wrangler

- Ensure Node.js (LTS) and `npm` are installed.
- Install or invoke Wrangler:
  - `npm install -g wrangler`
  - or run `npx wrangler --version` to use it ad‑hoc.
- Log in once so Wrangler can manage your Cloudflare account:
  - `wrangler login`

## 2. Create an Email Worker project

In a new, empty folder:

- `mkdir zk-email-relayer && cd zk-email-relayer`
- Initialize a Worker project:
  - `wrangler init --from-dash zk-email-relayer`
  - or `wrangler init` and choose the “Hello World” template.

Wrangler will create:

- `wrangler.toml`
- A JS/TS entry file (for example, `src/index.ts` or `src/worker.js`).

## 3. Configure `wrangler.toml` for Email Workers

Edit `wrangler.toml` to enable the email entrypoint:

```toml
name = "zk-email-relayer"
main = "src/email-worker.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["email"]

# optional: set the account ID explicitly
# account_id = "your-cloudflare-account-id"
```

- If you are using JavaScript instead of TypeScript, change `main` to `src/email-worker.js`.
- Keep `compatibility_date` reasonably current; update it if Wrangler suggests it during deploys.

## 4. Implement the Email Worker

Create `src/email-worker.ts` (or `.js`) with an `email` handler that:

- Filters for recovery addresses (for example, `reset@web3authn.org`).
- Canonicalizes headers (including `DKIM-Signature`) into a JSON object.
- POSTs that JSON to the Cloudflare Relay Worker (for example, `https://relay.tatchi.xyz/reset-email`).

Example shape:

```ts
export default {
  async email(message: EmailMessage, env: any, ctx: ExecutionContext) {
    const relayBaseUrl = env.RELAY_BASE_URL ?? "https://relay.tatchi.xyz";

    // Serialize headers (including DKIM-Signature) to JSON
    const headers: Record<string, string> = {};
    for (const [key, value] of message.headers as any) {
      headers[String(key).toLowerCase()] = String(value);
    }

    if (message.to === "reset@web3authn.org") {
      const payload = {
        to: message.to,
        from: message.from,
        subject: message.headers.get("subject") || "",
        headers, // includes DKIM-Signature if present
        // Optional: add a truncated/raw body snapshot if you need it server-side
      };

      const response = await fetch(`${relayBaseUrl}/reset-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Relay rejected or failed; treat as a hard failure for now.
        message.setReject("Recovery relayer rejected email");
        return;
      }

      // Optional: forward to a debug inbox for manual inspection.
      await message.forward("your-debug-inbox@example.com");
      return;
    }

    message.setReject("Unknown address");
  },
};
```

- For JavaScript, drop the type annotations and keep the same structure.
- The Email Worker does not verify DKIM or run zk proofs; it only re‑packages the message and forwards it to the existing Relay Worker.

## 5. Deploy the Email Worker

From the project root:

- `npx wrangler deploy`

Wrangler will:

- Build and upload the Worker.
- Print the Worker name and confirm deployment.

## 6. Wire Cloudflare Email Routing → Worker

In the Cloudflare dashboard:

- Navigate to **Email → Email Routing** for your domain.
- Ensure MX records are set for the domain (Cloudflare will guide you if not).
- Add a routing rule:
  - **Destination address**: `reset@web3authn.org` (or your chosen recovery alias).
  - **Action**: “Send to Worker”.
  - **Worker**: `zk-email-relayer` (the Worker you deployed above).

Once this rule is active:

- Any email sent to `reset@web3authn.org` will be delivered to your Email Worker.
- The Worker runs the `email` handler, can log, forward, or call your zk‑email relayer.

## 7. Next steps for zk‑email recovery

This plan focuses on the Email Worker + Relay Worker boundary. To turn it into a full zk‑email recovery path:

- Define the expected email format (subject/body fields) that encode `account_id`, `new_public_key`, and an optional nonce.
- Implement `POST /reset-email` on the existing Cloudflare Relay Worker (`examples/relay-cloudflare-worker`) to:
  - Accept the JSON payload from the Email Worker.
  - Verify DKIM and structural constraints (either directly or via a backend/prover service).
  - Run zk‑email proofs and submit transactions to:
    - The global `ZkEmailVerifier` contract (for proof verification).
    - The per‑user zk‑email‑recovery contract on NEAR (to add a new recovery key when policy is satisfied).
- Add logging and metrics on both Workers for observability, and tests that send synthetic emails through Email Routing into the full Email Worker → Relay Worker → NEAR path.

## 8. Email Worker runtime types

Cloudflare’s Email Workers expose the following runtime types (see Cloudflare Email Routing docs for the canonical definitions). These are the types you interact with in the `email` handler above.

### `ForwardableEmailMessage`

```ts
interface ForwardableEmailMessage<Body = unknown> {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;

  // Constructor is provided by the platform, not used directly in Workers code:
  // constructor(from: string, to: string, raw: ReadableStream | string);

  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
  reply(message: EmailMessage): Promise<void>;
}
```

- `from` / `to`: envelope sender/recipient.
- `headers`: full email headers (including `DKIM-Signature` when present).
- `raw` / `rawSize`: stream and size of the raw message.
- `setReject(reason)`: permanently reject the email with an SMTP error and message.
- `forward(rcptTo, headers?)`: forward the email to a verified destination, optionally adding `X-*` headers.
- `reply(message)`: send a reply `EmailMessage` back to the sender.

In the ES modules syntax, the `message` parameter in:

```ts
export default {
  async email(message, env, ctx) {
    // message is a ForwardableEmailMessage
  },
};
```

is a `ForwardableEmailMessage`.

### `EmailMessage`

```ts
interface EmailMessage {
  readonly from: string;
  readonly to: string;
}
```

This is used when composing replies with `message.reply(...)`:

- `from`: envelope sender for the reply.
- `to`: envelope recipient for the reply.

