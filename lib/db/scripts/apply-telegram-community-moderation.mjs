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

const tableNames = ["telegram_communities", "telegram_community_keyword_rules"];
const expectedColumns = [
  ["telegram_communities", "id", "integer", "NO"],
  ["telegram_communities", "chat_id", "text", "NO"],
  ["telegram_communities", "chat_title", "text", "NO"],
  ["telegram_communities", "organisation_id", "integer", "NO"],
  ["telegram_communities", "connected_by_user_id", "integer", "NO"],
  ["telegram_communities", "spam_protection_enabled", "boolean", "NO"],
  ["telegram_communities", "created_at", "timestamp with time zone", "NO"],
  ["telegram_communities", "updated_at", "timestamp with time zone", "NO"],
  ["telegram_community_keyword_rules", "id", "integer", "NO"],
  ["telegram_community_keyword_rules", "community_id", "integer", "NO"],
  ["telegram_community_keyword_rules", "phrase", "text", "NO"],
  ["telegram_community_keyword_rules", "normalized_phrase", "text", "NO"],
  ["telegram_community_keyword_rules", "enabled", "boolean", "NO"],
  ["telegram_community_keyword_rules", "created_by_user_id", "integer", "NO"],
  ["telegram_community_keyword_rules", "created_at", "timestamp with time zone", "NO"],
  ["telegram_community_keyword_rules", "updated_at", "timestamp with time zone", "NO"],
];
const expectedIndexes = new Map([
  ["telegram_communities_pkey", "(id)"],
  ["telegram_communities_chat_id_idx", "(chat_id)"],
  ["telegram_communities_organisation_idx", "(organisation_id)"],
  ["telegram_community_keyword_rules_pkey", "(id)"],
  ["telegram_community_keyword_rules_phrase_idx", "(community_id, normalized_phrase)"],
  ["telegram_community_keyword_rules_enabled_idx", "(community_id, enabled)"],
]);
const expectedForeignKeys = [
  "foreign key (organisation_id) references organisations(id) on delete cascade",
  "foreign key (connected_by_user_id) references users(id) on delete restrict",
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
    `SELECT table_name, column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [tableNames],
  );
  const indexes = await client.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = ANY($1::text[])
     ORDER BY indexname`,
    [tableNames],
  );
  const foreignKeys = await client.query(
    `SELECT pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
     JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
     WHERE schema_row.nspname = 'public'
       AND table_row.relname = ANY($1::text[])
       AND constraint_row.contype = 'f'
     ORDER BY table_row.relname, constraint_row.conname`,
    [tableNames],
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
    state.columns.map(({ table_name, column_name, data_type, is_nullable }) =>
      `${table_name}|${column_name}|${data_type}|${is_nullable}`,
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
    if (
      name === "telegram_communities_chat_id_idx" ||
      name === "telegram_community_keyword_rules_phrase_idx"
    ) {
      if (!definition.startsWith("create unique index ")) return false;
    }
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
  await client.query("SELECT pg_advisory_xact_lock(5190021)");

  const beforeState = await readMigrationState();
  if (beforeState.schema !== "public") throw new Error("Expected the public schema.");
  if (beforeState.columns.length > 0) {
    if (!isComplete(beforeState)) {
      throw new Error("The moderation tables already exist but do not match the approved migration.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community moderation migration was already applied and verified.");
  } else {
    const beforeCounts = await client.query(`
      SELECT
        (SELECT count(*)::text FROM users) AS users,
        (SELECT count(*)::text FROM organisations) AS organisations
    `);
    const migration = await readFile(
      new URL("../migrations/0021_telegram_community_moderation.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    const afterState = await readMigrationState();
    if (!isComplete(afterState)) throw new Error("Migration schema verification failed.");
    const afterCounts = await client.query(`
      SELECT
        (SELECT count(*)::text FROM users) AS users,
        (SELECT count(*)::text FROM organisations) AS organisations
    `);
    if (JSON.stringify(beforeCounts.rows[0]) !== JSON.stringify(afterCounts.rows[0])) {
      throw new Error("Existing user or organisation row counts changed.");
    }
    const newTableCounts = await client.query(`
      SELECT
        (SELECT count(*)::int FROM telegram_communities) AS communities,
        (SELECT count(*)::int FROM telegram_community_keyword_rules) AS rules
    `);
    if (newTableCounts.rows[0].communities !== 0 || newTableCounts.rows[0].rules !== 0) {
      throw new Error("Unexpected records appeared in the new moderation tables.");
    }

    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community moderation migration applied and verified; existing user and organisation rows were preserved.");
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  throw new Error(
    `Telegram community moderation migration did not complete; the transaction was rolled back (database error ${safeErrorCode(error)}).`,
  );
} finally {
  if (connected) await client.end();
}
