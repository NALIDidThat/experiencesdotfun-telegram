---
name: Web keyboard focus
description: Platform-specific use of the keyboard-controller provider in the Expo app.
---

Mount `KeyboardProvider` on iOS and Android, but not on web. The web app uses React Native Web inputs and a plain ScrollView fallback; it does not use the keyboard-controller scroll view.

**Why:** Mounting the native-oriented keyboard controller machinery in the web runtime can interfere with browser text-input focus, causing the software keyboard to close while typing across unrelated screens.

**How to apply:** Keep the provider conditional on `Platform.OS !== 'web'`. Preserve the provider for native screens that use `KeyboardAwareScrollView`.