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

const tableName = "telegram_community_member_stats";
const expectedColumns = [
  ["id", "integer", "NO"],
  ["chat_id", "text", "NO"],
  ["telegram_user_id", "text", "NO"],
  ["name", "text", "NO"],
  ["username", "text", "YES"],
  ["message_count", "integer", "NO"],
  ["telegram_joined_at", "timestamp with time zone", "YES"],
  ["telegram_left_at", "timestamp with time zone", "YES"],
  ["last_message_id", "integer", "YES"],
  ["first_observed_at", "timestamp with time zone", "NO"],
  ["updated_at", "timestamp with time zone", "NO"],
];
const expectedIndexes = new Map([
  ["telegram_community_member_stats_pkey", ["(id)", true]],
  ["telegram_community_member_stats_chat_user_idx", ["(chat_id, telegram_user_id)", true]],
  ["telegram_community_member_stats_leaderboard_idx", ["(chat_id, message_count, id)", false]],
]);

function normalizeDefinition(value) {
  return value.toLowerCase().replaceAll('"', "").replace(/\s+/g, " ").trim();
}

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
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  )).rows;
  const indexes = (await client.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1`,
    [tableName],
  )).rows;
  const constraints = (await client.query(
    `SELECT conname, contype, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conrelid = to_regclass($1)
     ORDER BY conname`,
    [`public.${tableName}`],
  )).rows;
  return { schema: schema?.name, columns, indexes, constraints };
}

function isComplete(state) {
  if (state.schema !== "public" || state.columns.length !== expectedColumns.length) return false;
  const actualColumns = new Set(
    state.columns.map(({ column_name, data_type, is_nullable }) =>
      `${column_name}|${data_type}|${is_nullable}`,
    ),
  );
  if (expectedColumns.some((column) => !actualColumns.has(column.join("|")))) return false;

  const actualIndexes = new Map(
    state.indexes.map(({ indexname, indexdef }) => [indexname, normalizeDefinition(indexdef)]),
  );
  if (actualIndexes.size !== expectedIndexes.size) return false;
  for (const [name, [columns, unique]] of expectedIndexes) {
    const definition = actualIndexes.get(name);
    if (!definition?.includes(columns)) return false;
    if (unique !== definition.startsWith("create unique index ")) return false;
  }

  const foreignKeys = state.constraints.filter(({ contype }) => contype === "f");
  const checks = state.constraints.filter(({ contype }) => contype === "c");
  const [foreignKey] = foreignKeys;
  const [check] = checks;
  const foreignKeyDefinition = foreignKey
    ? normalizeDefinition(foreignKey.definition)
    : "";
  const checkDefinition = check ? normalizeDefinition(check.definition) : "";
  return (
    foreignKeys.length === 1 &&
    foreignKeyDefinition.includes(
      "foreign key (chat_id) references telegram_communities(chat_id) on delete cascade",
    ) &&
    checks.length === 1 &&
    checkDefinition.includes("message_count >= 0") &&
    !checkDefinition.includes(" or ")
  );
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
  await client.query("SELECT pg_advisory_xact_lock(5190033)");

  const [target] = (await client.query(`
    SELECT current_schema() AS schema_name,
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
  if (beforeState.columns.length > 0) {
    if (!isComplete(beforeState)) {
      throw new Error("The member stats table exists but does not match the approved migration.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community member stats migration is already applied and verified.");
  } else {
    const beforeCounts = await readExistingRowCounts();
    const migration = await readFile(
      new URL("../migrations/0033_telegram_community_member_stats.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    const afterState = await readMigrationState();
    if (!isComplete(afterState)) {
      throw new Error("The member stats migration schema verification failed.");
    }
    const afterCounts = await readExistingRowCounts();
    if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) {
      throw new Error("Existing user, organisation, or community row counts changed.");
    }
    const [newTableCount] = (await client.query(
      `SELECT count(*)::int AS count FROM ${tableName}`,
    )).rows;
    if (newTableCount.count !== 0) {
      throw new Error("Unexpected rows appeared in the new member stats table.");
    }

    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community member stats migration applied and verified; existing rows were preserved.");
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  throw new Error(
    `Telegram community member stats migration did not complete; changes were rolled back (database error ${safeErrorCode(error)}).`,
  );
} finally {
  if (connected) await client.end();
}
