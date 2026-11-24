---
name: Expo preview bundle behavior
description: Why the mobile preview can keep rendering an older bundle after UI edits.
---

The mobile preview workflow sets `CI=1`, which starts Metro with reloads disabled. After source edits, the running preview can continue rendering an older bundle until the Expo workflow is restarted. Replacing an image at the same `require` path can also keep serving the old asset; a new asset path forces a fresh Metro URI.

**Why:** A screen redesign typechecked, but screenshots continued showing old UI and old photos after edits. Restarting updated the code bundle; changing image import paths updated the cached photos.

**How to apply:** If Expo screenshots or browser tests contradict the edited source, check the mobile workflow logs for CI mode and restart the configured workflow. If an image stays stale, check the asset URI and use a new filename or clear the Metro cache. Let the first cold bundle compile finish before trusting a screenshot.