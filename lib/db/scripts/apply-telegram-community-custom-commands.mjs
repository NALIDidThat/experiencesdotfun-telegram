import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-telegram-community-custom-commands";
if (!process.argv.includes(approval)) {
  throw new Error(`Approval required. After the user approves this production migration, pass ${approval}.`);
}
if (process.env.REPLIT_ENVIRONMENT !== "production") {
  throw new Error("Expected the explicitly approved production runtime. Refusing to change a different environment.");
}
if (process.env.DATABASE_BACKEND !== "supabase" || !process.env.SUPABASE_DATABASE_URL) {
  throw new Error("Expected the configured Supabase backend. Refusing to change a different database.");
}

let hostname;
try {
  hostname = new URL(process.env.SUPABASE_DATABASE_URL).hostname;
} catch {
  throw new Error("The configured Supabase database URL is invalid.");
}
if (!hostname.endsWith(".pooler.supabase.com")) {
  throw new Error("Expected the configured Supabase Session Pooler. Refusing to use another database endpoint.");
}

const tableName = "telegram_community_custom_commands";
const expectedColumns = [
  ["id", "integer", "NO"],
  ["chat_id", "text", "NO"],
  ["command", "text", "NO"],
  ["response", "text", "NO"],
  ["created_by_user_id", "integer", "NO"],
  ["created_at", "timestamp with time zone", "NO"],
  ["updated_at", "timestamp with time zone", "NO"],
];

function normalize(value) {
  return value.toLowerCase().replaceAll('"', "").replace(/\s+/g, " ").trim();
}

function databaseCode(error) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "unknown";
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
let connected = false;
let inTransaction = false;

async function readState() {
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );
  const indexes = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`,
    [tableName],
  );
  const checks = await client.query(
    `SELECT constraint_row.conname AS name, pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
     JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
     WHERE schema_row.nspname = 'public' AND table_row.relname = $1
       AND constraint_row.contype = 'c' ORDER BY constraint_row.conname`,
    [tableName],
  );
  const foreignKeys = await client.query(
    `SELECT pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
     JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
     WHERE schema_row.nspname = 'public' AND table_row.relname = $1
       AND constraint_row.contype = 'f' ORDER BY constraint_row.conname`,
    [tableName],
  );
  return {
    columns: columns.rows,
    indexes: new Map(indexes.rows.map(({ indexname, indexdef }) => [indexname, normalize(indexdef)])),
    checks: new Map(checks.rows.map(({ name, definition }) => [name, normalize(definition)])),
    foreignKeys: new Set(foreignKeys.rows.map(({ definition }) => normalize(definition))),
  };
}

function matchesExpected(state) {
  const columns = new Set(
    state.columns.map(({ column_name, data_type, is_nullable }) =>
      `${column_name}|${data_type}|${is_nullable}`,
    ),
  );
  if (state.columns.length !== expectedColumns.length
      || expectedColumns.some((column) => !columns.has(column.join("|")))) return false;

  const expectedIndexes = [
    ["telegram_community_custom_commands_pkey", "(id)"],
    ["telegram_community_custom_commands_chat_command_idx", "(chat_id, command)"],
  ];
  if (expectedIndexes.some(([name, columnsText]) => !state.indexes.get(name)?.includes(columnsText))) {
    return false;
  }
  const commandCheck = state.checks.get("telegram_community_custom_commands_command_format_check");
  const responseCheck = state.checks.get("telegram_community_custom_commands_response_length_check");
  return Boolean(
    state.checks.size === 2
      && commandCheck?.includes("command ~")
      && commandCheck.includes("^[a-z0-9_]{1,32}$")
      && responseCheck?.includes("char_length(btrim(response))")
      && responseCheck.includes("char_length(btrim(response)) >= 1")
      && responseCheck.includes("char_length(btrim(response)) <= 3500")
      && state.foreignKeys.has("foreign key (chat_id) references telegram_communities(chat_id) on delete cascade")
      && state.foreignKeys.has("foreign key (created_by_user_id) references users(id) on delete restrict"),
  );
}

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SELECT pg_advisory_xact_lock(5190038)");

  const dependencies = await client.query(
    `SELECT to_regclass('public.telegram_communities') AS communities,
            to_regclass('public.users') AS users,
            to_regclass('public.${tableName}') AS custom_commands`,
  );
  const dependency = dependencies.rows[0];
  if (!dependency?.communities || !dependency?.users) {
    throw new Error("Expected the existing Telegram community and user tables.");
  }

  if (dependency.custom_commands) {
    if (!matchesExpected(await readState())) {
      throw new Error("The custom-command table already exists but does not match this migration.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community custom-command migration was already applied and verified.");
  } else {
    const migration = await readFile(
      new URL("../migrations/0038_telegram_community_custom_commands.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));
    if (!matchesExpected(await readState())) {
      throw new Error("Custom-command migration schema verification failed.");
    }
    const rowCount = await client.query(`SELECT count(*)::text AS count FROM ${tableName}`);
    if (rowCount.rows[0]?.count !== "0") {
      throw new Error("Unexpected custom commands appeared during migration.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community custom-command migration applied and verified.");
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  const reason = error instanceof Error && /^Expected |^The |^Custom-/.test(error.message)
    ? error.message
    : `database error ${databaseCode(error)}`;
  throw new Error(`Telegram community custom-command migration did not complete; the transaction was rolled back (${reason}).`);
} finally {
  if (connected) await client.end();
}
