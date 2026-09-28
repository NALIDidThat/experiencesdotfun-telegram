---
name: OpenAPI date-only fields
description: Keep date-only API values compatible with string-backed database columns and generated Zod schemas.
---

Represent date-only values as strings with an explicit `YYYY-MM-DD` pattern in OpenAPI when the API and database store them as strings. Validate actual calendar dates separately in application code. Avoid `format: date` for these fields in this project because Orval's generated Zod schema maps it to a JavaScript `Date`, conflicting with the wire and database types.

**Why:** A generated date-only `Date` value caused type errors when passed to string-backed database columns.

**How to apply:** Before adding OpenAPI date formats, check generated Zod input types and database column types together; use string patterns plus explicit date validation when those types should remain strings.