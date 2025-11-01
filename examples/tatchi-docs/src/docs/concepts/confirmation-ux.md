---
title: Confirmation UX
---

# Confirmation UX

How the wallet ensures user‑presence and integrity during transaction approval.

- Modal inside wallet origin
  - The SDK renders the confirmation UI inside the wallet iframe to capture clicks in the correct context.
- Progress heuristics
  - During `STEP_2_USER_CONFIRMATION`, the overlay is kept visible so the modal can receive the gesture. Avoid hiding this phase.
- API‑driven and embedded flows
  - Use `executeAction` for automatic confirmation, or a React component (`SendTxButtonWithTooltip`) for embedded UI.
- After confirmation
  - Signing happens in the signer worker; the parent receives signed results over the message channel.

See also
- Guide: [Secure Transaction Confirmation](/docs/guides/tx-confirmation)
- Repo doc: https://github.com/web3-authn/sdk/blob/main/sdk/docs/transaction_confirmation_guide.md

