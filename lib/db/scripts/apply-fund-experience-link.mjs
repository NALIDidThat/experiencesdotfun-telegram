import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-experiences-dot-fun";
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
  const [column] = (await client.query(`
    SELECT data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organisation_funds'
      AND column_name = 'experience_id'
  `)).rows;
  const [foreignKey] = (await client.query(`
    SELECT count(*)::int AS count
    FROM pg_constraint AS fk
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = fk.conrelid
    WHERE fk.conrelid = 'public.organisation_funds'::regclass
      AND fk.confrelid = 'public.experiences'::regclass
      AND fk.contype = 'f'
      AND fk.confdeltype = 'n'
      AND fk.conkey = ARRAY[attribute.attnum]::smallint[]
      AND attribute.attname = 'experience_id'
  `)).rows;
  const [index] = (await client.query(`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'organisation_funds'
      AND indexname = 'organisation_funds_experience_idx'
  `)).rows;
  return {
    column,
    foreignKeyCount: foreignKey?.count ?? 0,
    indexDefinition: index?.indexdef ?? null,
  };
};

const isComplete = (state) =>
  state.column?.data_type === "integer"
  && state.column.is_nullable === "YES"
  && state.foreignKeyCount === 1
  && state.indexDefinition?.includes("(experience_id)")
  && state.indexDefinition?.includes("WHERE (experience_id IS NOT NULL)");

try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(5190020)");

  const [schema] = (await client.query("SELECT current_schema() AS name")).rows;
  if (schema?.name !== "public") throw new Error("Expected the public schema.");

  const beforeState = await readMigrationState();
  if (beforeState.column) {
    if (!isComplete(beforeState)) throw new Error("The Experience link exists but does not match the approved migration.");
    await client.query("COMMIT");
    console.log("Fundraiser–Experience migration was already applied and verified.");
  } else {
    const count = async () => (await client.query(`
      SELECT (SELECT count(*)::text FROM users) AS users,
        (SELECT count(*)::text FROM organisations) AS organisations,
        (SELECT count(*)::text FROM organisation_funds) AS funds,
        (SELECT count(*)::text FROM organisation_treasuries) AS treasuries
    `)).rows[0];
    const before = await count();
    const migration = await readFile(new URL("../migrations/0020_fund_experience_link.sql", import.meta.url), "utf8");
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    const afterState = await readMigrationState();
    if (!isComplete(afterState)) throw new Error("Migration verification failed for the Experience link.");
    const after = await count();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Existing row counts changed; migration rolled back.");

    await client.query("COMMIT");
    console.log("Fundraiser–Experience migration applied and verified. Existing fundraiser rows were preserved.");
  }
} catch {
  await client.query("ROLLBACK");
  throw new Error("Fundraiser–Experience migration did not complete. The transaction was rolled back.");
} finally {
  await client.end();
}
