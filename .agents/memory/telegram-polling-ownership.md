---
name: Telegram polling ownership
description: Operational constraint for the Experiences.fun Telegram bot's long-polling process.
---

Only one active process may call Telegram `getUpdates` for the bot at a time. Production owns polling by default, development polling stays opt-in, and updated API instances coordinate through a PostgreSQL session advisory lock.

**Why:** Telegram long polling uses exclusive update ownership. The database lease prevents competing updated API instances from polling, but cannot fence off an old deployment or any unrelated process using the same bot token.

**How to apply:** Keep development polling disabled unless production polling is intentionally stopped. After deploying lease-aware code, still check Telegram conflict logs; a persistent conflict means another poller outside the shared lease remains active. If switching to webhooks, ensure development startup cannot delete the production webhook.