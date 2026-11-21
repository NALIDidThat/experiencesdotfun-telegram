---
name: OpenAPI URL regex escaping
description: Keep generated Zod validators accurate when an OpenAPI pattern contains paired slashes.
---

In this workspace's OpenAPI → Orval → Zod pipeline, write an HTTPS prefix as `https:\/\//` in a single-quoted YAML pattern. That exact slash escaping lets Orval generate a regex that preserves both slashes in `https://`.

**Why:** Simpler escaped forms generated a malformed expression that rejected valid HTTPS links; the server and database must still enforce the same protocol boundary.

**How to apply:** After changing a slash-containing OpenAPI pattern, regenerate the client, confirm the generated `RegExp` accepts `https://example.org` and rejects `http://example.org`, and retain a test for both cases.
