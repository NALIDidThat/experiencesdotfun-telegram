---
name: Transitive package overrides
description: Preserve module compatibility when replacing vulnerable transitive dependencies.
---

When a patched transitive release changes module format, preserve the consuming package's expected API shape instead of blindly overriding its version.

**Why:** A CommonJS consumer may expect a callable module or named exports, while a newer ESM-only package loaded through `require()` can expose its API only under `default`. Lockfile and audit checks alone do not reveal that runtime mismatch.

**How to apply:** Prefer safe parent upgrades; when no compatible parent exists, use a narrowly scoped override and patch. Verify imports through the actual workspace package path, then run both runtime and type checks alongside the audit.

Version-based dependency scans do not evaluate locally patched source and can continue reporting a vulnerability after a tested backport, including for open advisories with no fixed upstream release.

**Why:** The workspace's dependency scanner identifies packages by upstream version metadata, not pnpm patch content.

**How to apply:** When an official fixed release is unavailable, check reachability, document the exception, and test the mitigation through the installed consumer. Do not suppress the advisory or relabel the version to claim a clean scan.