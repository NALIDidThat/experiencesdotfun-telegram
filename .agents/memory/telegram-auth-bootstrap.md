---
name: Telegram auth bootstrap
description: Durable constraints for bootstrapping Telegram Mini App authentication in the Expo client.
---

The Telegram auth bootstrap must load Telegram's WebApp SDK before reading `initData`, keep the React Query mutation behind a stable ref, and mount the public auth router before any router-wide authentication middleware. Parent-router mount order matters too.

**Why:** The Expo development shell does not reliably inject custom HTML, so the SDK must also be loaded at runtime. An earlier sibling router with a global bearer-token guard can intercept login before the public handler, producing the misleading “open from Telegram” response. Mutation observer identity changes can also restart bootstrap effects.

**How to apply:** When changing Telegram login, preserve the runtime SDK loader, keep the authentication callback stable, prefer live init data over stored data, and check both endpoint order within its router and mount order in the parent router.