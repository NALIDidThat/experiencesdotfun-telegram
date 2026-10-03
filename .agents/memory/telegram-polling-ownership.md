---
name: Telegram polling ownership
description: Operational constraint for the Experiences.fun Telegram bot's long-polling process.
---

Only one active process may call Telegram `getUpdates` for the bot at a time. The production VM owns polling by default; development polling is opt-in and should only be enabled while production is not polling.

**Why:** Telegram long polling uses exclusive update ownership rather than allowing multiple consumers to share the same bot queue. Letting the workspace's development server poll by default conflicts with the always-on production bot.

**How to apply:** Keep production as the default owner. For local bot testing, explicitly enable development polling only after disabling the production poller; do not run both against the shared token. If switching to webhooks, ensure development startup cannot delete the production webhook.