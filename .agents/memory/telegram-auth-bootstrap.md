---
name: Telegram auth bootstrap
description: Durable constraints for bootstrapping Telegram Mini App authentication in the Expo client.
---

The Telegram auth bootstrap must load Telegram's WebApp SDK before reading `initData`, keep the React Query mutation behind a stable ref, and post the signed data to a public authentication endpoint that runs before protected-route middleware.

**Why:** The Expo development shell does not reliably inject custom HTML, so the SDK must also be loaded at runtime. A missing public auth route caused first-time login requests to hit bearer-token middleware before a token existed, producing the misleading “open from Telegram” response. Mutation observer identity changes can also restart bootstrap effects.

**How to apply:** When changing Telegram login, preserve the runtime SDK loader, keep the authentication callback stable, prefer live init data over stored data, and ensure the login endpoint remains registered before authentication middleware.