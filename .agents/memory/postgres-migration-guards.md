---
name: PostgreSQL migration guards
description: Avoid false migration-verification failures caused by PostgreSQL normalizing constraint definitions.
---

Compare the meaning of PostgreSQL check constraints rather than relying on an exact match to their original SQL text. PostgreSQL can rewrite equivalent `IN (...)` checks into forms such as `= ANY (ARRAY[...])`.

**Why:** An exact definition comparison rejected a correct migration after PostgreSQL normalized its interval constraint.

**How to apply:** When verifying a migrated check constraint, parse and compare its permitted values or otherwise check its semantics; ensure expected values are all present and unexpected values are not silently accepted.
