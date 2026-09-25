---
name: Account-type selection
description: Product rules for setting Participant or Organisation during authentication and onboarding.
---

The Participant or Organisation choice is part of new-account creation. Returning accounts keep their saved server-side role; a new choice may fill an unset role but must not change an established one.

**Why:** Participants and organisations have different permissions and onboarding paths. Losing the selection can route participants into the wrong profile, while changing a returning user's role from the client could bypass server-side authorization.

**How to apply:** Pass the selected role through signup/authentication, persist it for new accounts, and keep existing non-null server roles authoritative for routing and permissions.