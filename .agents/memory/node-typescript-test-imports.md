---
name: Node TypeScript test imports
description: Runtime module resolution when Node's built-in test runner imports TypeScript source directly.
---

When a `.mjs` test imports a `.ts` helper directly under Node's built-in test runner, Node can strip the helper's TypeScript syntax but does not resolve extensionless relative runtime imports to neighboring `.ts` files. The workspace OpenAI client package has the same limitation when imported directly; for an isolated live smoke probe, bundle the temporary entry point with the API server's esbuild rather than plain Node.

**Why:** Direct Node execution fails during module loading before assertions or a smoke request can run, while TypeScript checks and the app's bundled build accept the imports.

**How to apply:** Keep directly tested helpers free of extensionless runtime dependencies when practical; pass shared runtime values as parameters rather than broadening TypeScript import settings just for the tests. Bundle one-off integration probes using the existing API build toolchain, without changing package import settings.