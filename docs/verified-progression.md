# Verified participant progression

## Eligible activity

Progress is calculated by the API from saved records only:

- A host-verified experience completion.
- A host-verified experience milestone.

An app open, sign-in, joined experience, attendance mark, submitted evidence, rejected review, or personal route does not count. No client input can add progression. The API calculates the signed-in participant's missions, achievement progress, and streak from the verified participation and milestone records.

## Streak dates

- The streak timezone is UTC for every participant.
- The credited calendar day is the UTC date of the host's verification timestamp.
- A late verification counts on the date it is verified; it is not backdated to attendance, submission, or the event date.
- Multiple eligible activities on one UTC date count as one streak day.
- A streak remains current through the following UTC date and resets after a full UTC date passes without a verification.

## Experience XP

Experience XP uses the existing `users.xp` balance and `xp_awards` history. Awards remain pending until a participant explicitly redeems them. Missions and achievements do not grant XP, change level thresholds, or alter Community XP or Memory Game scores.

## Database migration

No database migration is required for this progression release. Existing verified participation and milestone records are the source of truth; progression is derived when the authenticated profile requests it. This also means existing eligible history is reflected automatically. Existing records without a verification timestamp cannot be assigned a trustworthy streak date and are excluded from streak calculations.
