import { createHash } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.SUPABASE_DATABASE_URL;
const confirmation = process.env.MIGRATE_SUPABASE_CONFIRM;

if (!sourceUrl || !targetUrl) {
  throw new Error("Both DATABASE_URL and SUPABASE_DATABASE_URL must be available.");
}
if (sourceUrl === targetUrl) {
  throw new Error("Source and target database URLs must be different.");
}
if (confirmation !== "COPY_EMPTY_SUPABASE") {
  throw new Error("Set MIGRATE_SUPABASE_CONFIRM=COPY_EMPTY_SUPABASE to proceed.");
}

const tables = [
  "users",
  "email_accounts",
  "email_sessions",
  "telegram_sessions",
  "organisations",
  "experiences",
  "participations",
  "friendships",
  "friend_notifications",
  "community_contributions",
  "community_members",
  "accountability_partnerships",
  "accountability_commitments",
  "accountability_check_ins",
  "accountability_events",
  "analytics_events",
];
const sourcePool = new Pool({ connectionString: sourceUrl, max: 1 });
const targetPool = new Pool({ connectionString: targetUrl, max: 1 });
const source = await sourcePool.connect();
const target = await targetPool.connect();
let targetTransactionOpen = false;

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function rowsDigest(rows) {
  const hash = createHash("sha256");
  for (const row of rows) {
    const canonical = Object.fromEntries(
      Object.keys(row)
        .sort()
        .map((key) => [key, stableValue(row[key])]),
    );
    hash.update(JSON.stringify(canonical));
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function readRows(client, table, columns) {
  const columnSql = columns.map(quoteIdentifier).join(", ");
  return (
    await client.query(
      `SELECT ${columnSql}
         FROM public.${quoteIdentifier(table)}
        ORDER BY ${quoteIdentifier("id")}`,
    )
  ).rows;
}

async function countRows(client, table) {
  const result = await client.query(
    `SELECT count(*)::bigint AS count FROM public.${quoteIdentifier(table)}`,
  );
  return Number(result.rows[0].count);
}

async function sourceAdditiveSchema() {
  await source.query("BEGIN");
  try {
    await source.query(`
      ALTER TABLE public.email_accounts
        ALTER COLUMN password_hash DROP NOT NULL;
      ALTER TABLE public.email_accounts
        ADD COLUMN IF NOT EXISTS supabase_auth_user_id uuid;
      CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_supabase_auth_user_idx
        ON public.email_accounts (supabase_auth_user_id);

      CREATE TABLE IF NOT EXISTS public.analytics_events (
        id serial PRIMARY KEY,
        source text NOT NULL
          CONSTRAINT analytics_events_source_check
          CHECK (source IN ('app', 'bot', 'server')),
        event_name text NOT NULL
          CONSTRAINT analytics_events_event_name_check
          CHECK (event_name IN (
            'screen_view', 'auth_signup', 'auth_login', 'experience_view',
            'experience_create', 'experience_join', 'profile_update',
            'friend_request', 'bot_command', 'bot_callback',
            'community_contribution'
          )),
        category text NOT NULL
          CONSTRAINT analytics_events_category_check
          CHECK (category IN (
            'home', 'explore', 'experiences', 'profile', 'notifications',
            'friends', 'friend-profile', 'experience', 'host', 'create',
            'email', 'telegram', 'start', 'menu', 'onboarding', 'help',
            'xp', 'progress', 'rank', 'leaderboard', 'requests', 'add',
            'accountability', 'friendship', 'community', 'other'
          )),
        platform text NOT NULL
          CONSTRAINT analytics_events_platform_check
          CHECK (platform IN ('ios', 'android', 'web', 'telegram', 'server')),
        outcome text
          CONSTRAINT analytics_events_outcome_check
          CHECK (outcome IS NULL OR outcome IN ('success', 'failure')),
        event_date date NOT NULL DEFAULT CURRENT_DATE,
        expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
      );
      CREATE INDEX IF NOT EXISTS analytics_events_source_date_idx
        ON public.analytics_events (source, event_date);
      CREATE INDEX IF NOT EXISTS analytics_events_expires_at_idx
        ON public.analytics_events (expires_at);
    `);
    await source.query("COMMIT");
  } catch (error) {
    await source.query("ROLLBACK");
    throw error;
  }
}

async function secureTargetTables() {
  for (const table of tables) {
    const tableRef = `public.${quoteIdentifier(table)}`;
    await target.query(`ALTER TABLE ${tableRef} ENABLE ROW LEVEL SECURITY`);
    await target.query(`REVOKE ALL ON TABLE ${tableRef} FROM PUBLIC`);
    await target.query(`REVOKE ALL ON TABLE ${tableRef} FROM anon, authenticated`);
  }
  await target.query(
    "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated",
  );
}

try {
  const targetTableResult = await target.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const availableTargetTables = new Set(targetTableResult.rows.map((row) => row.table_name));
  const missingTargetTables = tables.filter((table) => !availableTargetTables.has(table));
  if (missingTargetTables.length) {
    throw new Error(`Supabase schema is incomplete: ${missingTargetTables.join(", ")}`);
  }

  const authUsers = await target.query("SELECT count(*)::bigint AS count FROM auth.users");
  if (Number(authUsers.rows[0].count) !== 0) {
    throw new Error("Supabase Auth already contains users; migration stopped.");
  }
  for (const table of tables) {
    if ((await countRows(target, table)) !== 0) {
      throw new Error(`Supabase public.${table} is not empty; migration stopped.`);
    }
  }

  await sourceAdditiveSchema();
  await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await target.query("BEGIN");
  targetTransactionOpen = true;

  const copiedCounts = {};
  for (const table of tables) {
    const sourceColumns = await tableColumns(source, table);
    const targetColumns = await tableColumns(target, table);
    if (sourceColumns.length === 0 || targetColumns.length === 0) {
      throw new Error(`Missing columns for public.${table}.`);
    }
    const sourceColumnSet = new Set(sourceColumns);
    const targetColumnSet = new Set(targetColumns);
    const sourceOnlyColumns = sourceColumns.filter((column) => !targetColumnSet.has(column));
    const targetRequiredColumns = (
      await target.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND is_nullable = 'NO'
            AND column_default IS NULL
            AND is_identity = 'NO'
            AND is_generated = 'NEVER'`,
        [table],
      )
    ).rows.map((row) => row.column_name);
    const missingRequiredColumns = targetRequiredColumns.filter(
      (column) => !sourceColumnSet.has(column),
    );
    if (sourceOnlyColumns.length || missingRequiredColumns.length) {
      throw new Error(`Column mismatch for public.${table}; migration stopped.`);
    }

    const rows = await readRows(source, table, sourceColumns);
    const columnsSql = sourceColumns.map(quoteIdentifier).join(", ");
    for (const row of rows) {
      const placeholders = sourceColumns.map((_, index) => `$${index + 1}`).join(", ");
      const values = sourceColumns.map((column) => row[column]);
      await target.query(
        `INSERT INTO public.${quoteIdentifier(table)} (${columnsSql})
         VALUES (${placeholders})`,
        values,
      );
    }

    const sourceDigest = rowsDigest(rows);
    const targetRows = await readRows(target, table, sourceColumns);
    if (sourceDigest !== rowsDigest(targetRows)) {
      throw new Error(`Row verification failed for public.${table}.`);
    }

    const maximumId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0);
    const sequence = await target.query(
      "SELECT pg_get_serial_sequence($1, 'id') AS sequence_name",
      [`public.${table}`],
    );
    const sequenceName = sequence.rows[0]?.sequence_name;
    if (sequenceName) {
      await target.query("SELECT setval($1::regclass, $2, $3)", [
        sequenceName,
        maximumId || 1,
        maximumId > 0,
      ]);
    }

    const targetCount = await countRows(target, table);
    if (targetCount !== rows.length) {
      throw new Error(`Row count verification failed for public.${table}.`);
    }
    copiedCounts[table] = targetCount;
  }

  await secureTargetTables();
  await target.query("COMMIT");
  targetTransactionOpen = false;
  await source.query("COMMIT");
  console.log(JSON.stringify({ migratedRowsByTable: copiedCounts }, null, 2));
  console.log("All row checksums matched; target tables have default-deny RLS enabled.");
} catch (error) {
  if (targetTransactionOpen) {
    await target.query("ROLLBACK").catch(() => {});
  }
  await source.query("ROLLBACK").catch(() => {});
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "preflight_or_unknown";
  const message = error instanceof Error && error.code === undefined
    ? error.message
    : `Database operation failed (${code}).`;
  console.error(`Supabase data migration stopped: ${message}`);
  process.exitCode = 1;
} finally {
  source.release();
  target.release();
  await Promise.all([sourcePool.end(), targetPool.end()]);
}