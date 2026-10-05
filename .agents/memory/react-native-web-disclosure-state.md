---
name: React Native Web disclosure state
description: How to expose expanded/collapsed state for cross-platform disclosure controls.
---

Set explicit `aria-expanded` on React Native Web disclosure buttons in addition to `accessibilityState={{ expanded }}`. The native accessibility state does not reliably become a DOM `aria-expanded` attribute in React Native Web.

**Why:** A browser interaction test exposed that the control's native state was correct while the web DOM lacked the expanded state needed by assistive technology.

**How to apply:** For expandable cards or sections that run on both native and web, keep `accessibilityState` for native and bind `aria-expanded` explicitly for web.
