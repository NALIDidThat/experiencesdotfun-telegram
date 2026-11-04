import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-experiences-dot-fun";
if (!process.argv.includes(approval)) {
  throw new Error(`Approval required. After the user approves this production migration, pass ${approval}.`);
}
if (process.env.REPLIT_ENVIRONMENT !== "production") {
  throw new Error("Expected the explicitly approved production runtime. Refusing to change a different environment.");
}
if (process.env.DATABASE_BACKEND !== "supabase" || !process.env.SUPABASE_DATABASE_URL) {
  throw new Error("Expected the configured Supabase backend. Refusing to change a different database.");
}

const databaseUrl = new URL(process.env.SUPABASE_DATABASE_URL);
if (!databaseUrl.hostname.endsWith(".pooler.supabase.com")) {
  throw new Error("Expected the configured Supabase Session Pooler. Refusing to use another database endpoint.");
}

const tableNames = ["feed_post_reports", "feed_notifications", "feed_push_tokens"];
const expectedColumns = [
  ["feed_post_reports", "id", "integer", "NO"],
  ["feed_post_reports", "activity_id", "integer", "YES"],
  ["feed_post_reports", "reported_activity_id", "integer", "NO"],
  ["feed_post_reports", "reported_author_id", "integer", "NO"],
  ["feed_post_reports", "reporter_user_id", "integer", "NO"],
  ["feed_post_reports", "reason", "text", "NO"],
  ["feed_post_reports", "details", "text", "YES"],
  ["feed_post_reports", "status", "text", "NO"],
  ["feed_post_reports", "created_at", "timestamp with time zone", "NO"],
  ["feed_notifications", "id", "integer", "NO"],
  ["feed_notifications", "recipient_user_id", "integer", "NO"],
  ["feed_notifications", "actor_user_id", "integer", "NO"],
  ["feed_notifications", "activity_id", "integer", "NO"],
  ["feed_notifications", "community_chat_id", "text", "NO"],
  ["feed_notifications", "read_at", "timestamp with time zone", "YES"],
  ["feed_notifications", "created_at", "timestamp with time zone", "NO"],
  ["feed_push_tokens", "id", "integer", "NO"],
  ["feed_push_tokens", "user_id", "integer", "NO"],
  ["feed_push_tokens", "expo_push_token", "text", "NO"],
  ["feed_push_tokens", "platform", "text", "NO"],
  ["feed_push_tokens", "enabled", "boolean", "NO"],
  ["feed_push_tokens", "created_at", "timestamp with time zone", "NO"],
  ["feed_push_tokens", "updated_at", "timestamp with time zone", "NO"],
];
const expectedIndexes = [
  "feed_post_reports_reporter_activity_idx",
  "feed_post_reports_review_idx",
  "feed_notifications_recipient_activity_idx",
  "feed_notifications_recipient_created_idx",
  "feed_notifications_recipient_read_idx",
  "feed_push_tokens_token_idx",
  "feed_push_tokens_user_enabled_idx",
];

function safeErrorCode(error) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "unknown";
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
let connected = false;
let inTransaction = false;

async function readMigrationState() {
  const [schema] = (await client.query("SELECT current_schema() AS name")).rows;
  const columns = (await client.query(
    `SELECT table_name, column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [tableNames],
  )).rows;
  const indexes = (await client.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [tableNames],
  )).rows;
  return { schema: schema?.name, columns, indexes };
}

function isComplete(state) {
  if (state.schema !== "public" || state.columns.length !== expectedColumns.length) return false;
  const actualColumns = new Set(
    state.columns.map(({ table_name, column_name, data_type, is_nullable }) =>
      `${table_name}|${column_name}|${data_type}|${is_nullable}`,
    ),
  );
  if (expectedColumns.some((column) => !actualColumns.has(column.join("|")))) return false;
  const actualIndexes = new Set(state.indexes.map(({ indexname }) => indexname));
  return expectedIndexes.every((indexName) => actualIndexes.has(indexName));
}

async function readExistingRowCounts() {
  return (await client.query(`
    SELECT
      (SELECT count(*)::text FROM users) AS users,
      (SELECT count(*)::text FROM organisations) AS organisations,
      (SELECT count(*)::text FROM telegram_communities) AS telegram_communities
  `)).rows[0];
}

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SELECT pg_advisory_xact_lock(5190031)");

  const [target] = (await client.query(`
    SELECT current_database() AS database_name, current_schema() AS schema_name,
      to_regclass('public.users') IS NOT NULL AS has_users,
      to_regclass('public.organisations') IS NOT NULL AS has_organisations,
      to_regclass('public.telegram_communities') IS NOT NULL AS has_communities
  `)).rows;
  if (
    target?.schema_name !== "public" ||
    !target.has_users ||
    !target.has_organisations ||
    !target.has_communities
  ) {
    throw new Error("The connected database does not match the expected Experiences.fun schema.");
  }

  const beforeState = await readMigrationState();
  const existingNewTableCount = new Set(beforeState.columns.map(({ table_name }) => table_name)).size;
  if (existingNewTableCount > 0) {
    if (!isComplete(beforeState)) {
      throw new Error("Some community feed tables already exist but do not match the complete approved migrations.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log(`Community feed and push migrations are already applied and verified on ${target.database_name}.`);
  } else {
    const beforeCounts = await readExistingRowCounts();
    for (const name of ["0030_community_feed_notifications.sql", "0031_community_push_tokens.sql"]) {
      const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
      await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));
    }

    const afterState = await readMigrationState();
    if (!isComplete(afterState)) throw new Error("The community feed migration schema verification failed.");
    const afterCounts = await readExistingRowCounts();
    if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) {
      throw new Error("Existing user, organisation, or community row counts changed.");
    }
    const [newTableCounts] = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM feed_post_reports) AS reports,
        (SELECT count(*)::int FROM feed_notifications) AS notifications,
        (SELECT count(*)::int FROM feed_push_tokens) AS push_tokens
    `)).rows;
    if (newTableCounts.reports !== 0 || newTableCounts.notifications !== 0 || newTableCounts.push_tokens !== 0) {
      throw new Error("Unexpected rows appeared in the newly created community feed tables.");
    }

    await client.query("COMMIT");
    inTransaction = false;
    console.log(`Community feed and push migrations applied and verified on ${target.database_name}; existing rows were preserved.`);
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  throw new Error(
    `Community feed migration did not complete; changes were rolled back (database error ${safeErrorCode(error)}).`,
  );
} finally {
  if (connected) await client.end();
}
