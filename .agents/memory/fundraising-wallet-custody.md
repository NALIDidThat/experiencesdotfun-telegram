---
name: Fundraising treasury model
description: Product decision for charity DAO treasury, wallet deposits, and volunteer payouts.
---

Use one DAO treasury per charity, with campaigns and experiences allocating from that shared balance. Accept wallet-based deposits only for now; no fiat on-ramp. Contributions to the treasury should be visible regardless of sender. The charity selects volunteers and proposes payouts, while its multisig signers authorize transfers. Experiences.fun must never hold private keys or sign treasury transactions on the charity's behalf.

**Why:** The user explicitly changed the funding model from direct-to-charity-wallet transfers to a shared charity DAO treasury controlled by a charity multisig, and deferred fiat on-ramping.

**How to apply:** Use donor-approved wallet transfers to the charity treasury, and verify incoming transactions from chain data before showing balances or contribution history. Never imply a DAO, deposit, or payout is active until its on-chain state is confirmed.
