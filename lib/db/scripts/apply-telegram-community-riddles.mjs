import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-experiences-dot-fun";
if (!process.argv.includes(approval)) {
  throw new Error(`Approval required. After the user approves the configured production migration, pass ${approval}.`);
}
if (process.env.REPLIT_ENVIRONMENT !== "production") {
  throw new Error("Expected the explicitly approved production runtime. Refusing to change a different environment.");
}
if (process.env.DATABASE_BACKEND !== "supabase" || !process.env.SUPABASE_DATABASE_URL) {
  throw new Error("Expected the configured Supabase backend. Refusing to change a different database.");
}

const expectedColumns = [
  ["riddles_enabled", "boolean", "NO"],
  ["riddle_interval_minutes", "integer", "NO"],
  ["next_riddle_at", "timestamp with time zone", "YES"],
  ["active_riddle_message_id", "integer", "YES"],
  ["active_riddle_id", "text", "YES"],
  ["active_riddle_expires_at", "timestamp with time zone", "YES"],
];
const expectedIndex = "telegram_communities_riddles_due_idx";
const allowedIntervals = [30, 60, 180, 360, 720, 1440];
const expectedConstraintNames = [
  "telegram_communities_riddle_interval_check",
  "telegram_communities_active_riddle_check",
];

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
  const schemaRows = await client.query("SELECT current_schema() AS name");
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'telegram_communities'
     ORDER BY ordinal_position`,
  );
  const indexes = await client.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'telegram_communities'
     ORDER BY indexname`,
  );
  const constraints = await client.query(
    `SELECT constraint_row.conname AS name,
            pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
     JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
     WHERE schema_row.nspname = 'public'
       AND table_row.relname = 'telegram_communities'
       AND constraint_row.contype = 'c'
     ORDER BY constraint_row.conname`,
  );
  return {
    schema: schemaRows.rows[0]?.name,
    columns: columns.rows,
    indexes: indexes.rows,
    constraints: constraints.rows,
  };
}

function isComplete(state) {
  if (state.schema !== "public") return false;
  const actualColumns = new Set(
    state.columns.map(({ column_name, data_type, is_nullable }) =>
      `${column_name}|${data_type}|${is_nullable}`,
    ),
  );
  if (expectedColumns.some((column) => !actualColumns.has(column.join("|")))) return false;

  const dueIndex = state.indexes.find(({ indexname }) => indexname === expectedIndex);
  if (!dueIndex) return false;
  const indexDefinition = normalizeDefinition(dueIndex.indexdef);
  if (!indexDefinition.includes("(riddles_enabled, next_riddle_at)")) return false;

  const constraints = new Map(
    state.constraints.map(({ name, definition }) => [name, normalizeDefinition(definition)]),
  );
  const intervalCheck = constraints.get("telegram_communities_riddle_interval_check");
  const actualIntervals = intervalCheck?.match(/\b\d+\b/g)?.map(Number) ?? [];
  if (
    !intervalCheck?.includes("riddle_interval_minutes") ||
    JSON.stringify(actualIntervals) !== JSON.stringify(allowedIntervals)
  ) {
    return false;
  }
  const activeCheck = constraints.get("telegram_communities_active_riddle_check");
  return Boolean(
    activeCheck &&
      ["active_riddle_message_id", "active_riddle_id", "active_riddle_expires_at"]
        .every((column) => activeCheck.includes(column)) &&
      activeCheck.includes("is null") &&
      activeCheck.includes("is not null") &&
      expectedConstraintNames.every((name) => constraints.has(name)),
  );
}

function describeIncompleteState(state) {
  const actualColumns = new Set(
    state.columns.map(({ column_name, data_type, is_nullable }) =>
      `${column_name}|${data_type}|${is_nullable}`,
    ),
  );
  const dueIndex = state.indexes.find(({ indexname }) => indexname === expectedIndex);
  const constraints = new Map(
    state.constraints.map(({ name, definition }) => [name, normalizeDefinition(definition)]),
  );
  return {
    schema: state.schema,
    missingColumns: expectedColumns.filter((column) => !actualColumns.has(column.join("|"))),
    dueIndex: dueIndex ? normalizeDefinition(dueIndex.indexdef) : null,
    constraints: Object.fromEntries(constraints),
  };
}

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SELECT pg_advisory_xact_lock(5190025)");

  const existingTable = await client.query(
    "SELECT to_regclass('public.telegram_communities') AS table_name",
  );
  if (!existingTable.rows[0]?.table_name) {
    throw new Error("Expected the existing public Telegram communities table.");
  }

  const beforeState = await readMigrationState();
  const beforeCount = await client.query(
    "SELECT count(*)::text AS count FROM public.telegram_communities",
  );
  const currentRiddleColumns = beforeState.columns.filter(({ column_name }) =>
    expectedColumns.some(([name]) => name === column_name),
  );

  if (currentRiddleColumns.length > 0) {
    if (!isComplete(beforeState)) {
      throw new Error("The riddle schedule schema already exists but does not match the approved migration.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community riddle migration was already applied and verified.");
  } else {
    const migration = await readFile(
      new URL("../migrations/0025_telegram_community_riddles.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    const afterState = await readMigrationState();
    if (!isComplete(afterState)) {
      throw new Error(`Migration schema verification failed: ${JSON.stringify(describeIncompleteState(afterState))}`);
    }
    const afterCount = await client.query(
      "SELECT count(*)::text AS count FROM public.telegram_communities",
    );
    if (beforeCount.rows[0]?.count !== afterCount.rows[0]?.count) {
      throw new Error("Existing Telegram community rows changed during the migration.");
    }
    const defaults = await client.query(
      `SELECT count(*)::text AS count
       FROM public.telegram_communities
       WHERE riddles_enabled IS DISTINCT FROM false
          OR riddle_interval_minutes IS DISTINCT FROM 60
          OR next_riddle_at IS NOT NULL
          OR active_riddle_message_id IS NOT NULL
          OR active_riddle_id IS NOT NULL
          OR active_riddle_expires_at IS NOT NULL`,
    );
    if (defaults.rows[0]?.count !== "0") {
      throw new Error("Existing communities did not receive the expected safe default settings.");
    }

    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community riddle migration applied and verified; existing group rows were preserved and left disabled.");
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  const reason = error && typeof error === "object" && "code" in error
    ? `database error ${safeErrorCode(error)}`
    : error instanceof Error && /^(Expected |The |Migration schema verification failed:)/.test(error.message)
      ? error.message
      : "unexpected runtime failure";
  throw new Error(`Telegram community riddle migration did not complete; the transaction was rolled back (${reason}).`);
} finally {
  if (connected) await client.end();
}
