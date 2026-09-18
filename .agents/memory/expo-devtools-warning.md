---
name: Expo DevTools native library warning
description: Expo web can serve normally even when React Native DevTools logs a missing libglib shared-library warning in the managed container.
---

The Expo workflow may print an error while installing React Native DevTools because the container lacks `libglib-2.0.so.0`; Metro can still start, serve the web preview, and run the app normally.

**Why:** This warning appeared during a successful Experiences.fun startup and did not affect the preview or application runtime.

**How to apply:** Check whether Metro is serving and the preview renders before treating this specific DevTools message as a blocking app error.