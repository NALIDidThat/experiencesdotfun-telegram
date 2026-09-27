---
name: Expo web gesture verification
description: Touch-input differences between the Replit Expo web preview and native gesture handling.
---

Keep browser touch verification separate from native responder verification. In the Expo web preview, automated touch input may not behave like a real user gesture.

**Why:** In headless mobile Chromium, a CDP-dispatched touch sequence navigated the preview target to `about:blank` on release, while synthetic DOM touch events exercised the web drag handler. Mouse input verified taps but not the drag path.

**How to apply:** Use the browser touch test harness for web drag behavior, and verify native PanResponder behavior on iOS/Android devices when available. Do not treat a blank CDP target by itself as evidence that the app navigated incorrectly.