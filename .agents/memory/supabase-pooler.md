---
name: Supabase database connectivity
description: Network access to Supabase PostgreSQL from this Replit environment
---

Use Supabase's Session Pooler connection string for PostgreSQL access from this workspace; the direct database endpoint is IPv6-only and is unreachable here.

**Why:** Direct endpoint connections failed from the Replit environment, while the Session Pooler connected successfully for schema inspection, migration, and validation.

**How to apply:** Configure `SUPABASE_DATABASE_URL` with the Session Pooler connection string and keep the direct endpoint out of workspace database operations.

Before external Supabase schema writes, verify the runtime and secret scope without reading secret values. Shared `DATABASE_BACKEND` and `SUPABASE_DATABASE_URL` settings can be available to both development and production; a Replit shell may report `REPLIT_ENVIRONMENT=production` even when the task began as a development change.

**Why:** A migration command must not infer its target from a workflow name or override the runtime to force a development target. A fail-closed runtime guard prevented an unintended write until the user explicitly approved the configured Supabase database, including possible production impact.

**How to apply:** Check non-secret runtime metadata and secret existence/scope, confirm the exact target with the user, and stop if the target does not match the approved environment. Never print or inspect secret values.