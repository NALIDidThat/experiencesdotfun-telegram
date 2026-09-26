---
name: Web keyboard focus
description: Platform-specific use of the keyboard-controller provider in the Expo app.
---

Mount `KeyboardProvider` on iOS and Android, but not on web. The web app uses React Native Web inputs and a plain ScrollView fallback; it does not use the keyboard-controller scroll view. Treat focus loss and keyboard-overlap scrolling as separate failure modes.

**Why:** Mounting the native-oriented keyboard controller machinery in the web runtime can interfere with browser text-input focus. Separately, mobile webviews may shrink only the visual viewport when the keyboard opens, so fixed-height flex layouts can leave scrollable content inaccessible. Chromium viewport emulation checks web layout and DOM focus, not native OS keyboard behavior.

**How to apply:** Keep the provider conditional on `Platform.OS !== 'web'`. For keyboard-overlap scrolling, resize the web app shell to `visualViewport.height`, allow flex children to shrink with `minHeight: 0`, use the compatible scroll wrapper for forms, and avoid dismissing the keyboard on drag. Treat browser-emulation results as web coverage and keep native-device keyboard checks separate.