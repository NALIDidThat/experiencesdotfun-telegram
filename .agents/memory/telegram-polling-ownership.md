---
name: Telegram polling ownership
description: Operational constraint for the Experiences.fun Telegram bot's long-polling process.
---

Only one active process may call Telegram `getUpdates` for the bot at a time. A local API workflow and the deployed bot can both start successfully, but Telegram terminates one poller with a conflict, preventing reliable update handling.

**Why:** Telegram long polling uses exclusive update ownership rather than allowing multiple consumers to share the same bot queue.

**How to apply:** When testing the deployed bot, stop the local API workflow first. When testing locally, ensure the deployment or any other bot process is not polling the same token.