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
  await client.query("SELECT pg_advisory_xact_lock(5190026)");

  const before = await client.query(`
    SELECT
      (SELECT count(*)::text FROM users) AS users,
      (SELECT count(*)::text FROM experiences) AS experiences,
      to_regclass('public.saved_experiences') IS NULL AS saved_table_absent,
      to_regclass('public.personal_memories') IS NULL AS memories_table_absent
  `);
  if (!before.rows[0].saved_table_absent || !before.rows[0].memories_table_absent) {
    throw new Error("A personal-collections table already exists; refusing to apply the migration.");
  }

  const migration = await readFile(
    new URL("../migrations/0026_personal_collections.sql", import.meta.url),
    "utf8",
  );
  if (!/^BEGIN;\s*$/m.test(migration) || !/^COMMIT;\s*$/m.test(migration)) {
    throw new Error("The personal-collections migration is missing its transaction boundaries.");
  }
  const migrationStatements = migration
    .replace(/^BEGIN;\s*$/m, "")
    .replace(/^COMMIT;\s*$/m, "");
  await client.query(migrationStatements);

  const after = await client.query(`
    SELECT
      (SELECT count(*)::text FROM users) AS users,
      (SELECT count(*)::text FROM experiences) AS experiences,
      to_regclass('public.saved_experiences') IS NOT NULL AS saved_table_present,
      to_regclass('public.personal_memories') IS NOT NULL AS memories_table_present,
      (SELECT count(*) FROM saved_experiences) AS saved_rows,
      (SELECT count(*) FROM personal_memories) AS memory_rows,
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'saved_experiences_user_experience_idx',
            'saved_experiences_user_category_created_idx',
            'personal_memories_user_updated_idx'
          )) AS expected_indexes
  `);
  const result = after.rows[0];
  if (
    result.users !== before.rows[0].users
    || result.experiences !== before.rows[0].experiences
    || !result.saved_table_present
    || !result.memories_table_present
    || Number(result.expected_indexes) !== 3
    || Number(result.saved_rows) !== 0
    || Number(result.memory_rows) !== 0
  ) {
    throw new Error("Post-migration checks failed; existing data or expected schema did not match.");
  }

  await client.query("COMMIT");
  transactionStarted = false;
  console.log("Personal collections migration applied; both tables and indexes verified, existing rows preserved.");
} catch (error) {
  if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
  const code = error && typeof error === "object" && "code" in error ? ` (PostgreSQL ${error.code})` : "";
  console.error(`Personal collections migration failed and was rolled back${code}. No connection details were logged.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
