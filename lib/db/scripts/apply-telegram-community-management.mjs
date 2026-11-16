import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-telegram-community-management";
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

const client = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
let connected = false;
let inTransaction = false;

async function tableExists(tableName) {
  const [result] = (await client.query("SELECT to_regclass($1) AS name", [`public.${tableName}`])).rows;
  return Boolean(result?.name);
}

async function readColumns(tableName) {
  return (await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  )).rows;
}

async function readBaseCounts() {
  return (await client.query(`
    SELECT
      (SELECT count(*)::text FROM users) AS users,
      (SELECT count(*)::text FROM organisations) AS organisations,
      (SELECT count(*)::text FROM telegram_communities) AS communities,
      (SELECT count(*)::text FROM community_contributions) AS contributions,
      (SELECT count(*)::text FROM telegram_community_member_stats) AS member_stats
  `)).rows[0];
}

async function isComplete() {
  const memberColumns = await readColumns("telegram_community_member_stats");
  const dailyColumns = await readColumns("telegram_community_member_daily_activity");
  const moderationColumns = await readColumns("telegram_community_moderation_events");
  const auditColumns = await readColumns("telegram_community_management_audit");
  const required = (columns, name, type, nullable) =>
    columns.some((column) =>
      column.column_name === name && column.data_type === type && column.is_nullable === nullable,
    );
  return (
    required(memberColumns, "qualifying_message_count", "integer", "NO")
    && required(memberColumns, "last_qualifying_message_at", "timestamp with time zone", "YES")
    && required(dailyColumns, "activity_date", "date", "NO")
    && required(dailyColumns, "qualifying_message_count", "integer", "NO")
    && required(moderationColumns, "rule_type", "text", "NO")
    && required(moderationColumns, "deletion_succeeded", "boolean", "NO")
    && required(auditColumns, "actor_user_id", "integer", "NO")
    && required(auditColumns, "action", "text", "NO")
  );
}

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SELECT pg_advisory_xact_lock(5190036)");

  const [target] = (await client.query(`
    SELECT current_schema() AS schema_name,
      to_regclass('public.users') IS NOT NULL AS has_users,
      to_regclass('public.organisations') IS NOT NULL AS has_organisations,
      to_regclass('public.telegram_communities') IS NOT NULL AS has_communities,
      to_regclass('public.community_contributions') IS NOT NULL AS has_contributions,
      to_regclass('public.telegram_community_member_stats') IS NOT NULL AS has_member_stats
  `)).rows;
  if (
    target?.schema_name !== "public"
    || !target.has_users
    || !target.has_organisations
    || !target.has_communities
    || !target.has_contributions
    || !target.has_member_stats
  ) {
    throw new Error("The connected database does not match the expected Experiences.fun schema.");
  }

  const allNewTables = await Promise.all([
    tableExists("telegram_community_member_daily_activity"),
    tableExists("telegram_community_moderation_events"),
    tableExists("telegram_community_management_audit"),
  ]);
  const hasNewColumn = (await readColumns("telegram_community_member_stats"))
    .some((column) => column.column_name === "qualifying_message_count");
  if (allNewTables.every(Boolean) && hasNewColumn) {
    if (!(await isComplete())) throw new Error("The management migration exists but does not match its approved shape.");
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community management migration is already applied and verified.");
  } else if (allNewTables.some(Boolean) || hasNewColumn) {
    throw new Error("The management migration is partially present; refusing to apply over an unexpected schema.");
  } else {
    const before = await readBaseCounts();
    const migration = await readFile(
      new URL("../migrations/0036_telegram_community_management_insights.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    if (!(await isComplete())) throw new Error("Management migration verification failed.");
    const after = await readBaseCounts();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("Existing users, organisations, communities, contributions, or member stats changed.");
    }

    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community management migration applied and verified; existing records were preserved.");
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  if (error instanceof Error && error.message.includes("approved shape")) {
    throw new Error("Telegram community management migration did not complete; changes were rolled back.");
  }
  throw new Error("Telegram community management migration did not complete; changes were rolled back.");
} finally {
  if (connected) await client.end();
}
