---
name: Expo web gesture verification
description: Touch-input differences between the Replit Expo web preview and native gesture handling.
---

Use explicit touch handlers for web drag interactions; PanResponder alone may not update the Expo web preview. Keep web and native gesture verification separate. In headless React Native web tests, wait for animated sheets to settle and click their controls without calling `scrollIntoView`, which can shift overlays and create false offscreen failures.

**Why:** In headless mobile Chromium, a CDP-dispatched touch sequence navigated the preview target to `about:blank` on release. Synthetic DOM touch events worked with explicit web touch handlers, while PanResponder alone did not rotate the globe. Scrolling a visible sheet action during browser tests also shifted its measured position.

**How to apply:** Use synthetic DOM touch events to verify web drag behavior; keep native PanResponder handling and verify it on iOS/Android devices when available. For animated sheets, wait until the action control is inside the viewport, then dispatch the click at its current position. Do not treat a blank CDP target by itself as evidence that the app navigated incorrectly.