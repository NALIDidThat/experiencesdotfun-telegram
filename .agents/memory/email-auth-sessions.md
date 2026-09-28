---
name: Email auth sessions
description: The authentication model for desktop email accounts and how it coexists with Telegram identity.
---

Email accounts use server-side scrypt password hashes and opaque, expiring bearer sessions. Successful signup creates a profile-bound session so new users can proceed directly into initial onboarding. Their profiles remain compatible with the shared authenticated API while Telegram notifications safely no-op when no Telegram chat ID exists.

**Why:** First-time users should be able to complete their profile immediately after creating the account instead of entering the same credentials again. Storing plaintext passwords or weakening the existing Telegram middleware would create avoidable security regressions.

**How to apply:** Keep email auth endpoints public, return the profile-bound token from successful signup and login, store only session hashes in the database, restore email sessions through `/me` on app startup, and preserve the Telegram init-data path separately.