---
name: Fundraising treasury model
description: Product decision for charity DAO treasury, wallet deposits, and volunteer payouts.
---

Use one DAO treasury per charity, with campaigns and experiences allocating from that shared balance. Accept wallet-based deposits only for now; no fiat on-ramp. Contributions to the treasury should be visible regardless of sender. The charity selects volunteers and proposes payouts, while its multisig signers authorize transfers. Experiences.fun must never hold private keys or sign treasury transactions on the charity's behalf.

Fundraising is optional for each Experience. Charity organisations can start a campaign from an Experience and attach that Experience to the fundraiser; treasury campaign cards should show verified progress and link to dedicated campaign tracking.

Campaign milestones are cumulative SOL fundraising thresholds paired with planned outcomes. Reaching a threshold reports verified campaign funding progress; it does not verify delivery or earmark or release shared-treasury funds.

**Why:** The user explicitly chose a shared charity DAO treasury controlled by a charity multisig, deferred fiat on-ramping, clarified that Experience fundraising is optional but should be directly launchable and explicitly linked, and chose threshold-and-outcome campaign milestones.

**How to apply:** Use donor-approved wallet transfers to the charity treasury, and verify incoming transactions from chain data before showing balances or contribution history. Keep the registered treasury address immutable unless rotation preserves historical addresses and activity. Keep fundraiser-to-Experience association nullable, show campaign-raised totals separately from treasury balance, and never infer funding without an explicit link. Keep milestone targets increasing and within the campaign goal; label threshold status as funding progress, not outcome completion or payout. Show historical-change metrics as unavailable until verified snapshots provide the baseline. Never imply a DAO, deposit, or payout is active until its on-chain state is confirmed.
