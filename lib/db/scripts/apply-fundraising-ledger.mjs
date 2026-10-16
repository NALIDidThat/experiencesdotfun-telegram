import { readFile } from "node:fs/promises";
import pg from "pg";

// This is intentionally NOT run on startup or by post-merge setup.
// The production Supabase target requires an explicit, informed approval.
const approval = "--approve-production-experiences-dot-fun";
if (!process.argv.includes(approval)) {
  throw new Error(`Approval required: this additive migration changes the configured Supabase database, which may be production. After the user approves, pass ${approval}.`);
}
if (process.env.DATABASE_BACKEND !== "supabase" || !process.env.SUPABASE_DATABASE_URL) {
  throw new Error("Expected the existing Supabase backend. Refusing to change a different database.");
}
const client = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
await client.connect();
try {
  const migration = await readFile(new URL("../migrations/0019_fund_contribution_ledger.sql", import.meta.url), "utf8");
  // Keep pre/post preservation checks and all DDL in one transaction. The SQL
  // migration is also independently executable, hence its own BEGIN/COMMIT.
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(5190019)");
  const count = async () => (await client.query(`
    SELECT (SELECT count(*)::text FROM users) AS users,
      (SELECT count(*)::text FROM organisations) AS organisations,
      (SELECT count(*)::text FROM organisation_funds) AS funds,
      (SELECT count(*)::text FROM organisation_treasuries) AS treasuries
  `)).rows[0];
  const before = await count();
  await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));
  const after = await count();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Existing row counts changed; migration rolled back.");
  await client.query("COMMIT");
  console.log("Fundraising migration applied. Existing users, organisations, campaigns and treasuries were preserved.");
} catch (error) {
  await client.query("ROLLBACK");
  // Do not print connections, credentials, rows or SQL parameters.
  throw new Error("Fundraising migration did not complete. The transaction was rolled back.", { cause: error });
} finally { await client.end(); }
