---
name: Account identities and profiles
description: Rules for grouping profiles under a verified sign-in and keeping profile data and sessions separate.
---

Participant and Organisation profiles belong to one authenticated Telegram or email identity group. Each group may have multiple profiles of either role. Switching selects a profile without changing an established role or merging its username, activity history, or organisation data. An unassigned legacy profile may be claimed once, and public usernames remain globally unique. Sessions remain bound to one profile and retain the sign-in provider that issued them. Do not merge a separately authenticated Telegram and email identity without an intentional, verified account-linking flow.

**Why:** Reusing one profile row mixes participant activity with organisation ownership and can let one person act as both sides of a reward flow. Profile-bound sessions preserve separate data while the verified identity group still provides the right key for preventing self-joins and self-rewards. Implicitly merging separate credentials could expose another person's profiles.

**How to apply:** Derive the profile group from the trusted authenticated session, authorize list/create/activate operations against that group, and issue a new session for the selected profile using the existing provider credential. Clear profile-scoped client data after switching. Keep established roles locked, require distinct global usernames, and compare identity groups—not only profile row IDs—when checking actions between hosts, participants, and reward recipients.

Organisation profile activity and statistics must come from the organisation’s hosted experiences and participation records, not the profile owner’s personal completions or XP.

**Why:** The user asked for organisation statistics to measure activity as an organisation.

**How to apply:** Keep participant contribution and XP panels role-specific; use organisation-owned host summaries and hosted activity for organisation profiles.