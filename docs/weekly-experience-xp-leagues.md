# Weekly Experience XP Leagues

## Scoring and categories

The three leagues are Environmental, Education, and Community. Each uses the category of the experience attached to a verified participation or verified milestone. A member's weekly score is the sum of those positive Experience XP awards only. Community XP, Memory Game awards and scores, sign-ins, submissions, and lifetime XP are not included.

Awards are accepted only when their unique source points to a verified participation or milestone submission owned by the same profile, and its verification timestamp matches the XP award timestamp. Each new award stores the Experience category at award time, so later edits cannot move it between leagues. The migration backfills older awards from their linked Experience's saved category. The award timestamp is used for the week, so redeeming pending awards later does not move points between weeks. A late host verification is credited in the week it is verified.

## Weeks and opt-in

Weeks are Monday 00:00 UTC through (but not including) the next Monday 00:00 UTC. A profile must opt in separately to each category. New members start in Bronze, and their score begins at their opt-in timestamp. Finalized standings and division movement include profiles that remain opted in through the week's close; leaving midweek does not affect that week's final ranks. Only opted-in Participant profiles appear in the current ranking. Leaving a category removes the profile's saved standings and history for that category; rejoining starts over in Bronze.

## Ranking and movement

Within a division, higher XP ranks first. Equal XP is resolved by the earlier first qualifying award, then the earlier opt-in time, then the lower profile ID. Each profile receives a deterministic rank.

The current-standing card shows how much additional verified XP would move a member above the next higher rank. Equal XP requires one additional point to break the tie.

The three divisions are Bronze, Silver, and Gold. A division needs at least five participants for movement. At weekly close, the highest 20% (rounded down, minimum one) move up one division and the lowest 20% move down one; the published tie-break order decides boundary places. Gold has no higher division and Bronze has no lower division.

The first request after a week closes finalizes that week from the verified award ledger. Finalized standings are immutable and retained while a profile remains opted in. The mobile history view displays the most recent 12 weekly results. Opting out deletes that profile's saved history.

## API limits

League pages contain up to 20 profiles. Page numbers are bounded to 50. The current profile's standing is returned separately, even when it is not on the requested page.
