import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-telegram-community-welcome";
if (!process.argv.includes(approval)) {
  throw new Error(`Approval required. After the user approves this production migration, pass ${approval}.`);
}
if (process.env.REPLIT_ENVIRONMENT !== "production") {
  throw new Error("Expected the explicitly approved production runtime. Refusing to change a different environment.");
}
if (process.env.DATABASE_BACKEND !== "supabase" || !process.env.SUPABASE_DATABASE_URL) {
  throw new Error("Expected the configured Supabase backend. Refusing to change a different database.");
}

let databaseHostname;
try {
  databaseHostname = new URL(process.env.SUPABASE_DATABASE_URL).hostname;
} catch {
  throw new Error("The configured Supabase database URL is invalid.");
}
if (!databaseHostname.endsWith(".pooler.supabase.com")) {
  throw new Error("Expected the configured Supabase Session Pooler. Refusing to use another database endpoint.");
}

const expectedColumns = [
  ["welcome_message", "text", "NO"],
  ["welcome_buttons", "jsonb", "NO"],
];
const expectedConstraints = [
  "telegram_communities_welcome_message_length_check",
  "telegram_communities_welcome_buttons_check",
  "telegram_communities_welcome_requires_message_check",
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

async function readSchemaState() {
  const [schema] = (await client.query("SELECT current_schema() AS name")).rows;
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'telegram_communities'
     ORDER BY ordinal_position`,
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
    schema: schema?.name,
    columns: columns.rows,
    constraints: new Map(
      constraints.rows.map(({ name, definition }) => [name, normalizeDefinition(definition)]),
    ),
  };
}

function isComplete(state) {
  const actualColumns = new Set(
    state.columns.map(({ column_name, data_type, is_nullable }) =>
      `${column_name}|${data_type}|${is_nullable}`,
    ),
  );
  if (state.schema !== "public" || expectedColumns.some((column) => !actualColumns.has(column.join("|")))) {
    return false;
  }

  const lengthCheck = state.constraints.get(expectedConstraints[0]);
  const buttonsCheck = state.constraints.get(expectedConstraints[1]);
  const requiresMessageCheck = state.constraints.get(expectedConstraints[2]);
  return Boolean(
    lengthCheck?.includes("char_length(welcome_message) <= 3500")
      && buttonsCheck?.includes("jsonb_typeof(welcome_buttons)")
      && buttonsCheck.includes("jsonb_array_length(welcome_buttons) <= 6")
      && requiresMessageCheck?.includes("char_length(btrim(welcome_message)) > 0")
      && requiresMessageCheck.includes("jsonb_array_length(welcome_buttons) = 0")
      && expectedConstraints.every((name) => state.constraints.has(name)),
  );
}

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SELECT pg_advisory_xact_lock(5190037)");

  const [table] = (await client.query(
    "SELECT to_regclass('public.telegram_communities') AS table_name",
  )).rows;
  if (!table?.table_name) {
    throw new Error("Expected the existing public Telegram communities table.");
  }

  const before = await readSchemaState();
  const beforeCount = (await client.query(
    "SELECT count(*)::text AS count FROM public.telegram_communities",
  )).rows[0]?.count;
  const anyWelcomeSchema = before.columns.some(({ column_name }) =>
    expectedColumns.some(([name]) => name === column_name),
  ) || expectedConstraints.some((name) => before.constraints.has(name));

  if (anyWelcomeSchema) {
    if (!isComplete(before)) {
      throw new Error("The welcome-message schema already exists but does not match the migration.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community welcome migration was already applied and verified.");
  } else {
    const migration = await readFile(
      new URL("../migrations/0037_telegram_community_welcome_messages.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));

    const after = await readSchemaState();
    if (!isComplete(after)) {
      throw new Error("Migration schema verification failed.");
    }
    const afterCount = (await client.query(
      "SELECT count(*)::text AS count FROM public.telegram_communities",
    )).rows[0]?.count;
    if (beforeCount !== afterCount) {
      throw new Error("Existing Telegram community rows changed during the migration.");
    }
    const defaults = (await client.query(
      `SELECT count(*)::text AS count
       FROM public.telegram_communities
       WHERE welcome_message IS DISTINCT FROM ''
          OR welcome_buttons IS DISTINCT FROM '[]'::jsonb`,
    )).rows[0]?.count;
    if (defaults !== "0") {
      throw new Error("Existing communities did not receive disabled welcome-message defaults.");
    }

    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community welcome migration applied and verified; existing greetings remain disabled.");
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  const reason = error && typeof error === "object" && "code" in error
    ? `database error ${safeErrorCode(error)}`
    : error instanceof Error && /^Expected |^The |^Migration /.test(error.message)
      ? error.message
      : "unexpected runtime failure";
  throw new Error(`Telegram community welcome migration did not complete; the transaction was rolled back (${reason}).`);
} finally {
  if (connected) await client.end();
}
