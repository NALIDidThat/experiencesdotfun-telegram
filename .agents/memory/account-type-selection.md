---
name: Account-type selection
description: Product rules for setting Participant or Organisation during authentication and onboarding.
---

Participant and Organisation are separate profiles under one verified Telegram identity. Switching must select or create the requested profile without changing an established profile's role or merging its username, participation history, or organisation data. An unassigned legacy profile may be claimed once. Public usernames remain globally unique, and Telegram sessions are bound to a specific profile.

**Why:** Reusing one user row mixes participant activity with organisation ownership and can let one person act as both sides of a reward flow. A profile-bound session preserves separate data while the verified Telegram identity still provides the right key for preventing self-joins and self-rewards.

**How to apply:** Resolve Telegram authentication by the selected role, issue sessions for that user row, and keep established roles locked. Require a distinct global username for each profile. Compare Telegram identity—not just profile row IDs—when checking actions between hosts, participants, and reward recipients.