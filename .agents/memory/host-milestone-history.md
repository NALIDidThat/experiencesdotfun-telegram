---
name: Host milestone history
description: Protect existing participant milestone submissions when a host edits or cancels an experience.
---

Once any participant has submitted a milestone, keep that experience's milestone definitions unchanged. Hosts can still edit other experience details, and cancellation must preserve both participants and milestone history.

**Why:** Milestone submissions reference definition IDs, and deleting definitions can cascade to submissions.

**How to apply:** When adding host edit or cancellation behavior, check all milestone submission states before changing definitions; treat cancellation as a status change, not a delete.