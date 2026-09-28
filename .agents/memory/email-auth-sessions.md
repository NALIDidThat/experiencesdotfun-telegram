---
name: Email auth sessions
description: The authentication model for desktop email accounts and how it coexists with Telegram identity.
---

Email accounts use server-side scrypt password hashes and opaque, expiring bearer sessions. Signup creates the account and profile but does not issue an app session; users explicitly log in to establish one. Their profiles remain compatible with the shared authenticated API while Telegram notifications safely no-op when no Telegram chat ID exists.

**Why:** Requiring an explicit login makes the post-signup confirmation accurate and keeps account creation distinct from authentication. Storing plaintext passwords or weakening the existing Telegram middleware would create avoidable security regressions.

**How to apply:** Keep email auth endpoints public, return a session token only from successful login, store only session hashes in the database, restore email sessions through `/me` on app startup, and preserve the Telegram init-data path separately.