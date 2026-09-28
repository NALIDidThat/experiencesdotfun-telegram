---
name: Node TypeScript test imports
description: Runtime module resolution when Node's built-in test runner imports TypeScript source directly.
---

When a `.mjs` test imports a `.ts` helper directly under Node's built-in test runner, Node can strip the helper's TypeScript syntax but does not resolve extensionless relative runtime imports to neighboring `.ts` files.

**Why:** A pure helper test failed during module loading before assertions ran, while the API TypeScript typecheck and bundled build accepted the extensionless import.

**How to apply:** Keep directly tested helpers free of extensionless runtime dependencies when practical; pass shared runtime values as parameters rather than broadening TypeScript import settings just for the tests.