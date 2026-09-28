---
name: Supabase database connectivity
description: Network access to Supabase PostgreSQL from this Replit environment
---

Use Supabase's Session Pooler connection string for PostgreSQL access from this workspace; the direct database endpoint is IPv6-only and is unreachable here.

**Why:** Direct endpoint connections failed from the Replit environment, while the Session Pooler connected successfully for schema inspection, migration, and validation.

**How to apply:** Configure `SUPABASE_DATABASE_URL` with the Session Pooler connection string and keep the direct endpoint out of workspace database operations.