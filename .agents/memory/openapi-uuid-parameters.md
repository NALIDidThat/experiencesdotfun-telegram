---
name: OpenAPI UUID parameters
description: Keep generated query and path UUID validators compatible with the workspace's Orval and Zod versions.
---

Use an anchored UUID `pattern` rather than `format: uuid` for OpenAPI query and path parameters that Orval coerces. Keep the pattern strict about UUID version and variant bits. Continue using `format: uuid` for body and response schemas where coercion is not involved.

**Why:** Orval generated `z.coerce.string().uuid()` for formatted path/query parameters, but the installed Zod v4 coerced-string type does not expose `.uuid()`, which broke the composite library typecheck.

**How to apply:** When adding or changing query/path UUID parameters, define the UUID pattern in `lib/api-spec/openapi.yaml`, regenerate the clients, and run the workspace typecheck.
