---
name: Verification migration target
description: User-designated Supabase target for organisation and contribution verification schema changes.
---

The user designated **Production — Experiences Dot Fun** as the target for the organisation and contribution verification migration.

**Why:** This project uses an external Supabase database, and the user identified the intended production environment to avoid applying DDL to the wrong project.

**How to apply:** Treat this as target identification only. Confirm the finalized migration contents and obtain explicit authorization before applying any schema changes.
