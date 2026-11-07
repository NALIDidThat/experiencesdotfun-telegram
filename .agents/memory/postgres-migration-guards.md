---
name: PostgreSQL migration guards
description: Avoid false migration-verification failures caused by PostgreSQL normalizing constraint definitions.
---

Verify migration output by catalog type: foreign keys and check constraints are in `pg_constraint`, while indexes are in `pg_indexes`. Require expected entries without rejecting harmless extra indexes. Compare check-constraint meaning rather than relying on exact SQL text, since PostgreSQL can rewrite equivalent `IN (...)` checks into forms such as `= ANY (ARRAY[...])`.

**Why:** PostgreSQL normalizes equivalent constraint SQL, and a foreign key is not an index. Strict text or index-count checks can falsely reject a correct migration.

**How to apply:** Query each catalog for the object type being checked. For constrained value sets, verify the exact permitted values; for indexes, ensure required names and definitions are present while preserving any extra indexes.
