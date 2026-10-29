---
name: React Native mockup rendering
description: Converting extracted React Native screen styles into accurate browser-based mockups.
---

When a native screen is rendered through lightweight HTML wrappers, translate numeric React Native `lineHeight` values to pixel lengths and map `paddingHorizontal`, `paddingVertical`, `marginHorizontal`, and `marginVertical` to CSS edges. Filter native-only props before forwarding them to DOM elements.

**Why:** CSS interprets numeric `line-height` as a multiplier, while React Native interprets it as a pixel length; direct passthrough can create extreme gaps and distorted screens.

**How to apply:** Use a sandbox-local style/prop adapter when extracting React Native UI into the web mockup sandbox. Verify the extracted baseline visually, not only with TypeScript.
