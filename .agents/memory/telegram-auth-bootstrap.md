---
name: Telegram auth bootstrap
description: Durable constraints for bootstrapping Telegram Mini App authentication in the Expo client.
---

The Telegram auth bootstrap should load Telegram's WebApp SDK before reading `initData`, but only treat the client as a Telegram Mini App when live `initData` is non-empty. Keep the React Query mutation behind a stable ref, and ensure public auth handlers are reachable before protected middleware.

**Why:** The Expo development shell does not reliably inject custom HTML, so the SDK must also be loaded at runtime. The SDK can expose `window.Telegram.WebApp` in a normal browser with empty `initData`; checking object presence alone forced web users into Telegram login. A root-mounted protected router can also intercept public login and return a misleading sign-in-required response. Mutation observer identity changes can restart bootstrap effects.

**How to apply:** When changing Telegram login, preserve the runtime SDK loader, keep the authentication callback stable, use non-empty live `initData` for platform detection and prefer live over stored data for sign-in. Scope protected middleware to its resource routes, and probe both public auth handlers and protected endpoints without credentials.