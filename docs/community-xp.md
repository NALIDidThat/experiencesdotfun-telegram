# Community XP

Community XP is reputation earned in one Telegram group. It is stored separately from the existing Experience XP balance and is shared by the bot, API, and Mini App through the same contribution ledger.

## Group messages

- A normal text message in a group or supergroup earns 1 Community XP when it contains at least 7 words.
- Commands, private messages, and bot messages do not earn Community XP.
- The first copy of a message can earn XP; an exact repeat from the same person in the same group is blocked for 60 seconds.
- A person can send at most 20 qualifying messages per minute for XP, and can earn at most 100 total Community XP per group per UTC day.
- The ledger records identifiers, word counts, contribution type, XP, and a keyed message fingerprint for duplicate detection. It does not store message text.

## Admin recognition

An administrator can reply to another member's message with an exact command such as `+1`, `+5`, or `+20`. The bot checks the sender's current role with Telegram before awarding anything.

- Self-rewards are rejected.
- Each reward is 1–20 XP.
- One admin can award at most 20 XP to the same recipient in the same group per UTC day.
- The recipient's overall group/day cap of 100 XP still applies.
- Successful awards retain the admin, recipient, group, command-message ID, and replied-to message ID for auditability.

To use this command, the bot must be an administrator in the group so Telegram can verify member roles.

## Bot setup and commands

Add the Experiences.fun bot to the group and allow it to receive ordinary group messages. Either disable the bot's privacy mode through BotFather or grant it the appropriate group permissions. Admin recognition also requires administrator status for the bot.

- `/rank` shows the caller's rank in the current group.
- `/rank @username` shows another member's rank in the current group.
- `/leaderboard` shows the group's top contributors.

Run only one Telegram long-polling bot instance with the bot token at a time. Running a local poller alongside a deployed poller can cause them to compete for updates.

The Mini App lists groups where the signed-in user has earned Community XP and reads their rank, level, leaderboard, and contribution history from the same server ledger.