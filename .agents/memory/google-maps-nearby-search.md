---
name: Nearby Places search centre
description: Prevents repeated Google Places calls as map cameras move.
---

Keep the live camera centre separate from the centre used by a Places query. Start a nearby search on initial profile-city load or explicit search/category actions only; camera movement updates a ref but must not start a paid query or rerender the whole map.

**Why:** camera movement previously retriggered nearby searches, increasing billing exposure and causing unnecessary rendering work.

**How to apply:** capture the latest camera coordinates when the user searches. Do not issue a new Places request after panning, resetting, or locating unless the user explicitly searches.
