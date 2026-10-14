---
name: Experience location selection
description: Preserve the current city-based experience model while using geocoded coordinates to drive the creation-step globe.
---

The Create Experience flow continues to persist its existing city field. A selected geocoding result supplies coordinates for the globe and a disambiguated city label for that field; do not add separate persisted coordinates to the API payload unless the experience schema is intentionally extended.

**Why:** the location-picker implementation brief requires retaining the existing creation data model and forbids coordinates that are only visual state.

**How to apply:** keep selection coordinates associated with the selected form city during wizard navigation; if future features need durable geographic coordinates, change the schema and persistence path deliberately.
