---
name: OpenAPI URL regex escaping
description: Keep generated Zod validators accurate when an OpenAPI pattern contains paired slashes.
---

In this workspace's OpenAPI → Orval → Zod pipeline, leave each slash in a `//` URL prefix escaped as `\/` in a single-quoted YAML pattern. Unescaped slash pairs can be truncated in generated `RegExp` output, while over-escaping can make the validator require literal backslashes.

**Why:** Outcome-evidence validation needed the generated client schema to retain both slashes in `https://`; the server and database already enforce the same protocol boundary.

**How to apply:** After changing a slash-containing OpenAPI pattern, regenerate the client, inspect the generated `RegExp`, and run positive and negative examples against it.
