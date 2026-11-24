# Social quests and community missions

Shared objectives use existing relationships and evidence rather than adding a new social graph or XP balance.

## Social quests

- A participant chooses an open experience and invites up to eight other participant profiles.
- Each invitee must be an accepted friend or an active accountability partner when invited and when accepting.
- The quest creator is already participating. Invitees must accept before they count.
- Each participant contributes one verified attendance record for the selected experience. Joining, a self-report, or an unverified submission does not count.
- The owner and current participants can see the participant list and verified progress. Participants who no longer have an accepted friendship or active partnership with the owner cannot view the quest.
- Completion recognition is issued once per participant after verified attendance. It does not award Experience XP.

## Community missions

- A participant with a linked Telegram identity and a positive qualifying contribution in a group can create a mission for that group.
- Only profiles with a positive qualifying contribution in the same group can join.
- Progress counts `telegram_message` ledger rows marked `qualified` with positive awarded Community XP, recorded after the mission starts. Admin adjustments, capped messages, repeats, and self-reported actions do not count.
- Participants see their own and other joined participants' counts, plus the collective target. A mission is complete when joined participants' qualifying ledger records reach that target.
- Eligible contributors receive a single completion-recognition record when the mission finishes. Recognition does not alter Community XP, Experience XP, or Community XP leaderboards.

## Retry and migration behavior

- Participant state changes are conditional database updates; recognition and notifications are written in the same transaction as the status change.
- Notification events are uniquely keyed by quest, recipient, actor, and event type to prevent repeat delivery.
- The database migration is intentionally staged. The API returns an explicit `503` for shared objectives until all three new tables exist; existing challenges, accountability actions, and Community XP remain available.
