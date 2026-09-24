---
name: Auth unit-test boundaries
description: Keep pure Telegram init-data validation testable without loading the database-bound API module.
---

Test Telegram init-data signatures and timestamp validation through a pure utility module rather than importing the full API auth service into Node's built-in test runner.

**Why:** In this workspace, Node's ESM loader cannot resolve the `@workspace/db` directory import when `node --test` directly imports the database-bound auth service; the package aliases are handled by the workspace build tooling instead.

**How to apply:** Keep crypto and input validation helpers free of database imports. Test those helpers directly, and use API-level integration tests for behavior that depends on database-backed auth.