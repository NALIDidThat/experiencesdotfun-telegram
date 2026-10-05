---
name: Expo web gesture verification
description: Touch-input differences between the Replit Expo web preview and native gesture handling.
---

Use explicit touch handlers for web drag interactions; PanResponder alone may not update the Expo web preview. Keep web and native gesture verification separate. In headless React Native web tests, do not call `scrollIntoView` for overlay controls; it can shift the sheet and create false offscreen failures.

**Why:** In headless mobile Chromium, a CDP-dispatched touch sequence navigated the preview target to `about:blank` on release. Synthetic DOM touch events worked with explicit web touch handlers, while PanResponder alone did not rotate the globe. A quick-action row also passed the viewport check while its sheet was still sliding, so the coordinate click activated an adjacent row.

**How to apply:** Use synthetic DOM touch events to verify web drag behavior; keep native PanResponder handling and verify it on iOS/Android devices when available. For animated sheets, wait for the exact target height to remain stable across several reads before clicking; a broad height threshold can pass while the sheet still covers the control. Confirm the hit target resolves to the intended control. Do not treat a blank CDP target by itself as evidence that the app navigated incorrectly.