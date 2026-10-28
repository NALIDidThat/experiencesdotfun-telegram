---
name: Staged database features
description: Keep existing API flows operational when feature code ships before an external schema migration is applied.
---

When a required external database migration is intentionally staged, do not let new schema references break existing page loads or established actions. Detect whether the full schema is available, keep legacy reads/writes compatible, and return an explicit unavailable response for only the new feature until the migration is applied.

**Why:** The accountability dashboard began returning 500s when its new goals table was absent, even though the migration had deliberately not been applied.

**How to apply:** Before adding schema-dependent reads to a core route, design the pre-migration behavior. Do not silently invent records or change schema; make the capability state explicit and limit unavailable responses to actions that actually require the migration.
