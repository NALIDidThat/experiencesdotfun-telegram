---
name: Supabase database connectivity
description: Network access to Supabase PostgreSQL from this Replit environment
---

Use Supabase's Session Pooler connection string for PostgreSQL access from this workspace; the direct database endpoint is IPv6-only and is unreachable here.

**Why:** Direct endpoint connections failed from the Replit environment, while the Session Pooler connected successfully for schema inspection, migration, and validation.

**How to apply:** Configure `SUPABASE_DATABASE_URL` with the Session Pooler connection string and keep the direct endpoint out of workspace database operations.

For Experiences.fun, new durable app data must be stored in the configured Supabase database and remain queryable on demand. Database changes must preserve existing rows.

**Why:** The user explicitly required durable Supabase storage, on-demand queryability, and no data loss.

**How to apply:** Use the existing Supabase-backed database client, keep schema migrations additive, and verify affected row counts and query access before and after database writes.

Before external Supabase schema writes, verify the runtime and secret scope without reading secret values. Shared `DATABASE_BACKEND` and `SUPABASE_DATABASE_URL` settings can be available to both development and production; a Replit shell may report `REPLIT_ENVIRONMENT=production` even when the task began as a development change.

**Why:** A migration command must not infer its target from a workflow name or override the runtime to force a development target. A fail-closed runtime guard prevented an unintended write until the user explicitly approved the configured Supabase database, including possible production impact.

**How to apply:** Check non-secret runtime metadata and secret existence/scope, confirm the exact target with the user, and stop if the target does not match the approved environment. Never print or inspect secret values.

A development-mode API workflow can still inherit production-scoped Supabase and Telegram secrets. `NODE_ENV=development` does not indicate the database target.

**Why:** Restarting it can start Telegram long polling and write against production Supabase.

**How to apply:** Before starting the API workflow, check runtime/backend/secret scopes. If they resolve to production, use read-only checks or a production-safe path rather than launching development polling.

The API test suite selects its live integration database from `DATABASE_BACKEND`; `supabase` runs an XP redemption integration test that inserts temporary production rows.

**Why:** A workspace-wide test run unexpectedly targeted the configured Supabase database. The test's `finally` block cleans up its fixture, but it can still mutate the selected database during the test.

**How to apply:** For local unit validation, run the API tests with `DATABASE_BACKEND=none` to skip database-backed integration tests, or use a disposable isolated database. Do not assume `pnpm test` is database-safe when the backend is configured as Supabase.