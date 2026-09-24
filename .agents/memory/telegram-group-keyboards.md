---
name: Telegram group bot compatibility
description: Telegram Bot API constraints for commands and reply keyboards in group chats.
---

Telegram rejects inline `web_app` buttons in group and supergroup chats with `BUTTON_TYPE_INVALID`, which can make a command appear to do nothing when the whole `sendMessage` call fails. Convert these buttons to ordinary URL buttons in group replies. Keep personal-data commands and friendship callbacks private, and expose only group-safe commands in group command menus.

**Why:** Web App buttons are supported only in private chats between a user and a bot; other inline buttons can still fail the entire group reply.

**How to apply:** Route every group command and public group callback response through the group-safe keyboard transformation. Keep private-only command and callback guards in place.