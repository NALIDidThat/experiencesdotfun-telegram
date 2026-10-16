---
name: Expo Router platform route fallback
description: Expo Router 57 requires a base route alongside platform-suffixed route files.
---

When a route is platform-specific, add an unsuffixed sibling route as a fallback. A `.web.tsx` route without a same-name `.tsx` sibling causes Expo Router to fail while building the route tree, even when the route is intended only for web.

**Why:** The web-only map bridge route initially prevented the entire app from rendering because Expo Router rejected the missing fallback sibling.

**How to apply:** For platform-specific pages under `app/`, keep a minimal base route alongside the platform implementation and verify a fresh Expo Router startup.
