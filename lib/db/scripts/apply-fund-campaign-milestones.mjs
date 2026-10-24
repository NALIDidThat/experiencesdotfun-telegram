import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-fund-milestones";
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
    SELECT to_regclass('public.organisation_fund_milestones') AS name
  `)).rows;
  if (!table?.name) return null;

  const columns = (await client.query(`
    SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organisation_fund_milestones'
  `)).rows;
  const [constraints] = (await client.query(`
    SELECT
      count(*) FILTER (WHERE conname = 'organisation_fund_milestones_fund_position_unique' AND contype = 'u')::int AS unique_count,
      count(*) FILTER (WHERE conname IN (
        'organisation_fund_milestones_position_check',
        'organisation_fund_milestones_title_length_check',
        'organisation_fund_milestones_outcome_length_check',
        'organisation_fund_milestones_target_check'
      ) AND contype = 'c')::int AS check_count,
      count(*) FILTER (
        WHERE contype = 'f'
          AND confrelid = 'public.organisation_funds'::regclass
          AND confdeltype = 'c'
      )::int AS cascade_foreign_key_count
    FROM pg_constraint
    WHERE conrelid = 'public.organisation_fund_milestones'::regclass
  `)).rows;
  return { columns, constraints };
};

const isComplete = (state) => {
  if (!state || state.columns.length !== 7) return false;
  const byName = new Map(state.columns.map((column) => [column.column_name, column]));
  return byName.get("id")?.data_type === "integer"
    && byName.get("fund_id")?.data_type === "integer"
    && byName.get("position")?.data_type === "integer"
    && byName.get("title")?.data_type === "text"
    && byName.get("outcome")?.data_type === "text"
    && byName.get("target_sol")?.data_type === "numeric"
    && byName.get("target_sol")?.numeric_precision === 20
    && byName.get("target_sol")?.numeric_scale === 9
    && byName.get("created_at")?.data_type === "timestamp with time zone"
    && state.constraints?.unique_count === 1
    && state.constraints?.check_count === 4
    && state.constraints?.cascade_foreign_key_count === 1;
};

const readExistingRowCounts = async () => (await client.query(`
  SELECT
    (SELECT count(*)::text FROM users) AS users,
    (SELECT count(*)::text FROM organisations) AS organisations,
    (SELECT count(*)::text FROM organisation_funds) AS funds,
    (SELECT count(*)::text FROM organisation_treasuries) AS treasuries
`)).rows[0];

try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(5190023)");

  const [schema] = (await client.query("SELECT current_schema() AS name")).rows;
  if (schema?.name !== "public") throw new Error("Expected the public schema.");

  const beforeState = await readMigrationState();
  if (beforeState) {
    if (!isComplete(beforeState)) throw new Error("The milestone table exists but does not match the approved migration.");
    await client.query("COMMIT");
    console.log("Fundraiser milestone migration was already applied and verified.");
  } else {
    const before = await readExistingRowCounts();
    const migration = await readFile(new URL("../migrations/0023_fund_campaign_milestones.sql", import.meta.url), "utf8");
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    if (!isComplete(await readMigrationState())) throw new Error("Migration verification failed for fundraiser milestones.");
    const after = await readExistingRowCounts();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Existing row counts changed; migration rolled back.");

    await client.query("COMMIT");
    console.log("Fundraiser milestone migration applied and verified. Existing rows were preserved.");
  }
} catch {
  await client.query("ROLLBACK");
  throw new Error("Fundraiser milestone migration did not complete. The transaction was rolled back.");
} finally {
  await client.end();
}
