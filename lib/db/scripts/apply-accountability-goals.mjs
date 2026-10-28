import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-experiences-dot-fun";
if (!process.argv.includes(approval)) {
  throw new Error(`Explicit approval required; rerun with ${approval} only after approval.`);
}
if (
  process.env.REPLIT_ENVIRONMENT !== "production"
  || process.env.DATABASE_BACKEND !== "supabase"
  || !process.env.SUPABASE_DATABASE_URL
) {
  throw new Error("Expected the approved production Supabase runtime. Refusing to change a different database.");
}

const databaseUrl = new URL(process.env.SUPABASE_DATABASE_URL);
if (!databaseUrl.hostname.endsWith(".pooler.supabase.com") || databaseUrl.port !== "5432") {
  throw new Error("Expected the Supabase Session Pooler on port 5432. Refusing to connect.");
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
let transactionStarted = false;

try {
  await client.connect();
  await client.query("BEGIN");
  transactionStarted = true;
  await client.query("SELECT pg_advisory_xact_lock(5190027)");

  const before = await client.query(`
    SELECT
      (SELECT count(*)::text FROM users) AS users,
      (SELECT count(*)::text FROM accountability_commitments) AS commitments,
      (SELECT count(*)::text FROM accountability_check_ins) AS check_ins,
      to_regclass('public.accountability_goals') IS NULL AS goals_table_absent,
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'accountability_commitments'
          AND column_name = 'goal_id'
      ) AS goal_column_absent,
      (SELECT is_nullable = 'NO' FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'accountability_commitments'
          AND column_name = 'partnership_id') AS commitment_partnership_required,
      (SELECT is_nullable = 'NO' FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'accountability_check_ins'
          AND column_name = 'partnership_id') AS checkin_partnership_required
  `);
  const initial = before.rows[0];
  if (
    !initial.goals_table_absent
    || !initial.goal_column_absent
    || !initial.commitment_partnership_required
    || !initial.checkin_partnership_required
  ) {
    throw new Error("The accountability schema is not in the expected pre-migration state.");
  }

  const migration = await readFile(
    new URL("../migrations/0027_accountability_goals.sql", import.meta.url),
    "utf8",
  );
  if (!/^BEGIN;\s*$/m.test(migration) || !/^COMMIT;\s*$/m.test(migration)) {
    throw new Error("The accountability-goals migration is missing its transaction boundaries.");
  }
  const migrationStatements = migration
    .replace(/^BEGIN;\s*$/m, "")
    .replace(/^COMMIT;\s*$/m, "");
  await client.query(migrationStatements);

  const after = await client.query(`
    SELECT
      (SELECT count(*)::text FROM users) AS users,
      (SELECT count(*)::text FROM accountability_commitments) AS commitments,
      (SELECT count(*)::text FROM accountability_check_ins) AS check_ins,
      to_regclass('public.accountability_goals') IS NOT NULL AS goals_table_present,
      (SELECT is_nullable = 'YES' FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'accountability_commitments'
          AND column_name = 'partnership_id') AS commitment_partnership_nullable,
      (SELECT is_nullable = 'YES' FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'accountability_check_ins'
          AND column_name = 'partnership_id') AS checkin_partnership_nullable,
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'accountability_goal_owner_status_idx',
            'accountability_goal_partnership_idx',
            'accountability_commitment_goal_created_idx'
          )) AS expected_indexes,
      (SELECT count(*) FROM pg_constraint
        WHERE conname = 'accountability_goal_visibility_partnership_check') AS scope_constraint,
      (SELECT count(*)::text FROM accountability_goals) AS goals
  `);
  const result = after.rows[0];
  if (
    result.users !== initial.users
    || result.commitments !== initial.commitments
    || result.check_ins !== initial.check_ins
    || !result.goals_table_present
    || !result.commitment_partnership_nullable
    || !result.checkin_partnership_nullable
    || Number(result.expected_indexes) !== 3
    || Number(result.scope_constraint) !== 1
    || result.goals !== "0"
  ) {
    throw new Error("Post-migration checks failed; existing data or expected schema did not match.");
  }

  await client.query("COMMIT");
  transactionStarted = false;
  console.log("Accountability goals migration applied; goal table, privacy constraint, indexes, and existing rows verified.");
} catch (error) {
  if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
  const code = error && typeof error === "object" && "code" in error ? ` (PostgreSQL ${error.code})` : "";
  console.error(`Accountability goals migration failed and was rolled back${code}. No connection details were logged.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
