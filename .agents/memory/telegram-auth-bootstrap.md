---
name: Telegram auth bootstrap
description: Durable constraints for bootstrapping Telegram Mini App authentication in the Expo client.
---

The Telegram auth bootstrap must not depend on the identity of the React Query mutation result. Store the current mutation in a ref and keep the bootstrap callback stable, otherwise rerenders can restart the initialization loop and leave the app on its loading screen.

**Why:** The mutation observer result may be recreated during rerenders; using the whole result as a callback dependency can repeatedly cancel the previous bootstrap before it clears loading.

**How to apply:** When changing AuthContext initialization, keep the callback stable, prefer live Telegram init data over stored data, and only poll for delayed init data when a Telegram WebApp object is present.