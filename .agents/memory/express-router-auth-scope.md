---
name: Express router auth scope
description: Prevent protected feature routers from intercepting sibling API endpoints.
---

Mount authentication-protected routers at their resource prefix, or scope router-wide authentication middleware to that resource prefix. Avoid applying a top-level auth guard to unrelated API paths.

**Why:** Express runs a root-mounted router’s unscoped middleware for unrelated paths too. A protected feature router intercepted public sign-in endpoints before their validators and returned a misleading sign-in-required response.

**How to apply:** When adding a protected Express router, check both its internal route paths and the parent `router.use(...)` mount path. Confirm public auth paths reach their own validation handlers and protected resource paths still reject missing credentials.