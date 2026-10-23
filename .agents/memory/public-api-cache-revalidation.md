---
name: Public API cache revalidation
description: Avoid HTTP 304 responses being treated as API failures by generated mobile clients.
---

When a generated client uses `customFetch` and treats every non-2xx response as an error, a browser cache revalidation that returns HTTP 304 can leave the query retrying instead of providing JSON. For views that need a fresh response, pass `cache: 'no-store'` through that hook's request options rather than changing caching globally.

**Why:** The shared client checks `response.ok`, which is false for 304; the public activity endpoint can be revalidated by browser ETags.

**How to apply:** Use request-level no-store for the affected public query, then confirm the endpoint returns 200 and the UI leaves its loading state.
