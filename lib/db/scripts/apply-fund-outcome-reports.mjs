import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-fund-outcome-reports";
if (!process.argv.includes(approval)) {
  throw new Error(`Approval required: this migration changes the configured Supabase database. After the user approves, pass ${approval}.`);
}
if (process.env.REPLIT_ENVIRONMENT !== "production") {
  throw new Error("Expected the explicitly approved production runtime. Refusing to change a different environment.");
}
if (process.env.DATABASE_BACKEND !== "supabase" || !process.env.SUPABASE_DATABASE_URL) {
  throw new Error("Expected the existing Supabase backend. Refusing to change a different database.");
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
await client.connect();

const readMigrationState = async () => {
  const [table] = (await client.query(`
    SELECT to_regclass('public.organisation_fund_outcome_reports') AS name
  `)).rows;
  if (!table?.name) return null;

  const columns = (await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organisation_fund_outcome_reports'
  `)).rows;
  const [constraints] = (await client.query(`
    SELECT
      count(*) FILTER (WHERE contype = 'c' AND conname IN (
        'organisation_fund_outcome_reports_status_check',
        'organisation_fund_outcome_reports_title_length_check',
        'organisation_fund_outcome_reports_planned_outcome_length_check',
        'organisation_fund_outcome_reports_update_length_check',
        'organisation_fund_outcome_reports_evidence_url_check'
      ))::int AS check_count,
      count(*) FILTER (WHERE contype = 'p')::int AS primary_key_count,
      count(*) FILTER (WHERE contype = 'f' AND confdeltype = 'r')::int AS restricted_foreign_key_count
    FROM pg_constraint
    WHERE conrelid = 'public.organisation_fund_outcome_reports'::regclass
  `)).rows;
  const [indexes] = (await client.query(`
    SELECT count(*)::int AS count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'organisation_fund_outcome_reports'
      AND indexname = 'organisation_fund_outcome_reports_milestone_created_idx'
  `)).rows;
  return { columns, constraints, indexes };
};

const isComplete = (state) => {
  if (!state || state.columns.length !== 9) return false;
  const byName = new Map(state.columns.map((column) => [column.column_name, column]));
  const isNotNull = (name) => byName.get(name)?.is_nullable === "NO";
  return byName.get("id")?.data_type === "integer"
    && isNotNull("id")
    && byName.get("milestone_id")?.data_type === "integer"
    && isNotNull("milestone_id")
    && byName.get("reported_by_user_id")?.data_type === "integer"
    && isNotNull("reported_by_user_id")
    && byName.get("milestone_title")?.data_type === "text"
    && isNotNull("milestone_title")
    && byName.get("planned_outcome")?.data_type === "text"
    && isNotNull("planned_outcome")
    && byName.get("status")?.data_type === "text"
    && isNotNull("status")
    && byName.get("update_text")?.data_type === "text"
    && isNotNull("update_text")
    && byName.get("evidence_url")?.data_type === "text"
    && byName.get("evidence_url")?.is_nullable === "YES"
    && byName.get("created_at")?.data_type === "timestamp with time zone"
    && isNotNull("created_at")
    && state.constraints?.check_count === 5
    && state.constraints?.primary_key_count === 1
    && state.constraints?.restricted_foreign_key_count === 2
    && state.indexes?.count === 1;
};

const readExistingRowCounts = async () => (await client.query(`
  SELECT
    (SELECT count(*)::text FROM users) AS users,
    (SELECT count(*)::text FROM organisations) AS organisations,
    (SELECT count(*)::text FROM organisation_funds) AS funds,
    (SELECT count(*)::text FROM organisation_fund_milestones) AS milestones,
    (SELECT count(*)::text FROM organisation_treasuries) AS treasuries
`)).rows[0];

try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(5190024)");

  const [schema] = (await client.query("SELECT current_schema() AS name")).rows;
  if (schema?.name !== "public") throw new Error("Expected the public schema.");

  const beforeState = await readMigrationState();
  if (beforeState) {
    if (!isComplete(beforeState)) throw new Error("The outcome report table exists but does not match the approved migration.");
    await client.query("COMMIT");
    console.log("Fundraiser outcome report migration was already applied and verified.");
  } else {
    const before = await readExistingRowCounts();
    const migration = await readFile(new URL("../migrations/0024_fund_milestone_outcome_reports.sql", import.meta.url), "utf8");
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    if (!isComplete(await readMigrationState())) throw new Error("Migration verification failed for fundraiser outcome reports.");
    const after = await readExistingRowCounts();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Existing row counts changed; migration rolled back.");

    await client.query("COMMIT");
    console.log("Fundraiser outcome report migration applied and verified. Existing rows were preserved.");
  }
} catch {
  await client.query("ROLLBACK");
  throw new Error("Fundraiser outcome report migration did not complete. The transaction was rolled back.");
} finally {
  await client.end();
}
