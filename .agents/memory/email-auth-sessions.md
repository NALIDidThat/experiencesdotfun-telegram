---
name: Email auth sessions
description: The authentication model for desktop email accounts and how it coexists with Telegram identity.
---

Email accounts use server-side scrypt password hashes and opaque, expiring bearer sessions. Their profiles remain compatible with the shared authenticated API while Telegram notifications safely no-op when no Telegram chat ID exists.

**Why:** Desktop users need a real login path, but storing plaintext passwords or weakening the existing Telegram middleware would create avoidable security and product regressions.

**How to apply:** Keep email auth endpoints public, keep session tokens out of API responses except at login/signup, store only session hashes in the database, restore email sessions through `/me` on app startup, and preserve the Telegram init-data path separately.