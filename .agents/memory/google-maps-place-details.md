---
name: Google Places details
description: The React Google Maps library scope and Places JavaScript details-fetch contract.
---

Call `useMapsLibrary('places')` from a component rendered inside `APIProvider`. A nested nearby-search component can receive the Places library while a sibling hook above the provider remains `null`.

`Place.fetchFields()` populates the `Place` instance and resolves without returning a `{ place }` object. Create the instance, await `fetchFields()`, then read the requested fields from that same instance.

**Why:** Nearby Search can succeed while selecting a business silently falls back if its details handler is outside provider scope or treats `fetchFields()` as returning data.

**How to apply:** Keep Places-dependent hooks and calls under the map provider, and verify details selection with a live browser test when changing the Maps JavaScript API integration.
