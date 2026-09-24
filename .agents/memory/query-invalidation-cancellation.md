---
name: Query invalidation cancellation
description: React Query refetch cancellations can surface as AbortError after a successful mutation.
---

In the Expo web client, mutation-triggered `queryClient.invalidateQueries()` can surface an `AbortError` when active refetches are canceled or replaced. Treat that error as normal cancellation, not as failure of the completed mutation. Keep unexpected refresh failures observable instead of swallowing every error.

**Why:** App logs showed an `AbortError` attributed to friend-request mutation success even though the mutation had completed.

**How to apply:** Use a guarded invalidation helper for mutation-triggered refreshes, and add regression coverage when mobile flow tests are introduced.