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

const tableName = "telegram_community_link_rules";
const expectedColumns = [
  ["id", "integer", "NO"],
  ["community_id", "integer", "NO"],
  ["link", "text", "NO"],
  ["normalized_host", "text", "NO"],
  ["normalized_path", "text", "NO"],
  ["created_by_user_id", "integer", "NO"],
  ["created_at", "timestamp with time zone", "NO"],
];
const expectedIndexes = new Map([
  [`${tableName}_pkey`, "(id)"],
  [`${tableName}_unique_idx`, "(community_id, normalized_host, normalized_path)"],
  [`${tableName}_host_idx`, "(community_id, normalized_host)"],
]);
const expectedForeignKeys = [
  "foreign key (community_id) references telegram_communities(id) on delete cascade",
  "foreign key (created_by_user_id) references users(id) on delete restrict",
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
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );
  const indexes = await client.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
     ORDER BY indexname`,
    [tableName],
  );
  const foreignKeys = await client.query(
    `SELECT pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
     JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
     WHERE schema_row.nspname = 'public'
       AND table_row.relname = $1
       AND constraint_row.contype = 'f'
     ORDER BY constraint_row.conname`,
    [tableName],
  );
  return {
    schema: schemaRows.rows[0]?.name,
    columns: columns.rows,
    indexes: indexes.rows,
    foreignKeys: foreignKeys.rows,
  };
}

function isComplete(state) {
  if (state.schema !== "public" || state.columns.length !== expectedColumns.length) return false;
  const actualColumns = new Set(
    state.columns.map(({ column_name, data_type, is_nullable }) =>
      `${column_name}|${data_type}|${is_nullable}`,
    ),
  );
  if (expectedColumns.some((column) => !actualColumns.has(column.join("|")))) return false;

  const indexDefinitions = new Map(
    state.indexes.map(({ indexname, indexdef }) => [indexname, normalizeDefinition(indexdef)]),
  );
  if (indexDefinitions.size !== expectedIndexes.size) return false;
  for (const [name, columns] of expectedIndexes) {
    const definition = indexDefinitions.get(name);
    if (!definition?.includes(columns)) return false;
    if (name.endsWith("_unique_idx") && !definition.startsWith("create unique index ")) return false;
  }

  const actualForeignKeys = new Set(
    state.foreignKeys.map(({ definition }) => normalizeDefinition(definition)),
  );
  return (
    actualForeignKeys.size === expectedForeignKeys.length &&
    expectedForeignKeys.every((definition) => actualForeignKeys.has(definition))
  );
}

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SELECT pg_advisory_xact_lock(5190022)");

  const schemaRows = await client.query(
    `SELECT
       to_regclass('public.telegram_communities') AS communities,
       to_regclass('public.users') AS users,
       to_regclass('public.${tableName}') AS link_rules`,
  );
  if (!schemaRows.rows[0]?.communities || !schemaRows.rows[0]?.users) {
    throw new Error("Expected the existing public Telegram community and user tables.");
  }

  if (schemaRows.rows[0].link_rules) {
    const currentState = await readMigrationState();
    if (!isComplete(currentState)) {
      throw new Error("The link-rule table already exists but does not match the approved migration.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community link-rule migration was already applied and verified.");
  } else {
    const migration = await readFile(
      new URL("../migrations/0022_telegram_community_link_rules.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    const afterState = await readMigrationState();
    if (!isComplete(afterState)) throw new Error("Migration schema verification failed.");
    const newRows = await client.query(`SELECT count(*)::text AS count FROM ${tableName}`);
    if (newRows.rows[0]?.count !== "0") {
      throw new Error("Unexpected records appeared in the new link-rule table.");
    }

    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community link-rule migration applied and verified.");
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  throw new Error(
    `Telegram community link-rule migration did not complete; the transaction was rolled back (database error ${safeErrorCode(error)}).`,
  );
} finally {
  if (connected) await client.end();
}
