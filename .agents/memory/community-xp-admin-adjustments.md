---
name: Community XP admin adjustments
description: Safety and daily-budget semantics for signed Community XP changes by Telegram group admins.
---

Telegram group admins may adjust a replied-to member's Community XP with bounded signed amounts. Keep authorization server-side and record each adjustment in the contribution ledger. A deduction must not reduce the member's balance below zero. Count the absolute magnitude of positive and negative admin adjustments together toward the per-admin/per-recipient daily limit. Do not let deductions replenish the community's positive daily XP budget.

**Why:** Signed adjustments need to remain auditable and bounded; otherwise deductions could be used to evade grant limits or make the shared daily XP pool effectively renewable.

**How to apply:** Preserve these rules when changing Telegram admin XP commands, community balance updates, or XP cap calculations.
