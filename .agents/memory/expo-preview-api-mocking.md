---
name: Expo preview API mocks
description: Browser API interception for authenticated Expo web-preview interaction tests.
---

When headless Chromium intercepts authenticated API calls to an Expo preview domain, answer `OPTIONS` preflight requests before returning mocked API responses. Allow the app origin, the HTTP method, and requested headers such as `authorization` and `content-type`.

**Why:** If the preflight is not fulfilled, the browser blocks the authenticated request. The app can then fall back to its signed-out UI, which looks like a broken test session rather than a mock setup failure.

**How to apply:** In CDP Fetch interception tests, handle `OPTIONS` first, then mock the authenticated `GET` and mutation requests. Wait for loaded server-state values, not just the initial screen shell.