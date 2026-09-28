---
name: Drizzle push filters
description: Safely scope Drizzle schema pushes when applying a narrow change to an external PostgreSQL database.
---

Do not assume a `tablesFilter` in a dedicated Drizzle config limits `drizzle-kit push` to that table. In this workspace, the verbose push still included creation statements for other tables and drops for unrelated sequences.

**Why:** The external production database already had tables with some of those names; the broad push failed on the first duplicate relation before reaching the requested new table.

**How to apply:** Read every proposed statement before accepting a push to an external database. If output includes unrelated objects, stop and apply only the explicitly authorized DDL in a transaction, then verify the created columns, indexes, and constraints.