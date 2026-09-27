---
name: Transitive package overrides
description: Preserve module compatibility when replacing vulnerable transitive dependencies.
---

When a patched transitive release changes module format, preserve the consuming package's expected API shape instead of blindly overriding its version.

**Why:** A CommonJS consumer may expect a callable module or named exports, while a newer ESM-only package loaded through `require()` can expose its API only under `default`. Lockfile and audit checks alone do not reveal that runtime mismatch.

**How to apply:** Prefer safe parent upgrades; when no compatible parent exists, use a narrowly scoped override and patch. Verify imports through the actual workspace package path, then run both runtime and type checks alongside the audit.