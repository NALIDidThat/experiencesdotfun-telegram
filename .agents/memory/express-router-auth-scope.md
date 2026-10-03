---
name: Express router auth scope
description: Prevent protected feature routers from intercepting sibling API endpoints.
---

Mount authentication-protected routers at their resource prefix, or attach authentication middleware only to their specific route declarations. Avoid mounting a router with top-level `router.use(requireAuth)` at the API root.

**Why:** Express runs a root-mounted router’s unscoped middleware for unrelated paths too. A pinned-friends guard intercepted public sign-in endpoints and returned a misleading Telegram-required response.

**How to apply:** When adding a protected Express router, check both its internal route paths and the parent `router.use(...)` mount path. Confirm public auth paths do not enter that router, and probe login endpoints without credentials to ensure they reach their own validation handlers.