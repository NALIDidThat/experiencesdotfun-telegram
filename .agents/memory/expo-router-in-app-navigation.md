---
name: Expo in-app navigation tests
description: How to assert single-route screen changes in Expo Router browser interaction tests.
---

When an Expo screen changes through `router.setParams` and local React state, test the rendered destination and its expected content instead of assuming `window.location.search` will reflect the new screen.

**Why:** A mobile Home prompt interaction rendered the expected journey screen while the browser query string remained unchanged, causing a URL-only assertion to fail despite correct navigation.

**How to apply:** For Expo web tests of stateful single-route screens, assert the destination screen's visible heading/content and absence of the source screen. Assert URL changes only when the route actually navigates.