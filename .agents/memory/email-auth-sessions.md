---
name: Email auth sessions
description: The authentication model for desktop email accounts and how it coexists with Telegram identity.
---

Email accounts use server-side scrypt password hashes and opaque, expiring bearer sessions. Successful signup creates the profile, session, and initial signup XP on the server, then returns the session token so the app can authenticate immediately. Their profiles remain compatible with the shared authenticated API while Telegram notifications safely no-op when no Telegram chat ID exists.

**Why:** The signup implementation can create a valid server session and still leave the user signed out if the response serializer drops the token. XP must also be server-authoritative and granted only with new profile creation, so retries cannot award it again. Storing plaintext passwords or weakening Telegram authentication would create avoidable security regressions.

**How to apply:** Keep email auth endpoints public, include the session token in successful signup and login responses, store only session hashes in the database, restore email sessions through `/me` on app startup, and preserve the Telegram init-data path separately. Grant signup XP only during server-side profile creation; show the congratulation screen before onboarding without changing XP in client state.
