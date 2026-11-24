import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-telegram-community-join-captcha";
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

const tableName = "telegram_communities";
const expectedColumns = [
  ["join_captcha_enabled", "boolean", "NO"],
  ["join_captcha_button_text", "text", "NO"],
];
const expectedConstraint = "telegram_communities_join_captcha_button_text_check";

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
  const [target] = (await client.query(`
    SELECT current_schema() AS schema_name,
      to_regclass('public.users') IS NOT NULL AS has_users,
      to_regclass('public.organisations') IS NOT NULL AS has_organisations,
      to_regclass('public.telegram_communities') IS NOT NULL AS has_communities
  `)).rows;
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );
  const constraints = await client.query(
    `SELECT constraint_row.conname AS name,
            pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
     JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
     WHERE schema_row.nspname = 'public'
       AND table_row.relname = $1
       AND constraint_row.contype = 'c'
     ORDER BY constraint_row.conname`,
    [tableName],
  );
  return {
    target,
    columns: columns.rows,
    constraints: new Map(
      constraints.rows.map(({ name, definition }) => [name, normalizeDefinition(definition)]),
    ),
  };
}

function hasCompleteSchema(state) {
  const actualColumns = new Map(
    state.columns.map(({ column_name, data_type, is_nullable, column_default }) => [
      column_name,
      { data_type, is_nullable, column_default },
    ]),
  );
  const enabled = actualColumns.get(expectedColumns[0][0]);
  const buttonText = actualColumns.get(expectedColumns[1][0]);
  const definition = state.constraints.get(expectedConstraint);

  return Boolean(
    enabled?.data_type === expectedColumns[0][1]
      && enabled.is_nullable === expectedColumns[0][2]
      && enabled.column_default === "false"
      && buttonText?.data_type === expectedColumns[1][1]
      && buttonText.is_nullable === expectedColumns[1][2]
      && buttonText.column_default?.toLowerCase().includes("verify i''m human")
      && definition?.includes("char_length(btrim(join_captcha_button_text)) >= 1")
      && definition.includes("char_length(btrim(join_captcha_button_text)) <= 64"),
  );
}

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SELECT pg_advisory_xact_lock(5190039)");

  const before = await readSchemaState();
  if (
    before.target?.schema_name !== "public"
    || !before.target.has_users
    || !before.target.has_organisations
    || !before.target.has_communities
  ) {
    throw new Error("The connected database does not match the expected Experiences.fun schema.");
  }

  const presentColumns = expectedColumns.filter(([name]) =>
    before.columns.some((column) => column.column_name === name),
  ).length;
  const hasConstraint = before.constraints.has(expectedConstraint);
  if (presentColumns === expectedColumns.length && hasConstraint) {
    if (!hasCompleteSchema(before)) {
      throw new Error("The join-verification schema exists but does not match the migration.");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community join-verification migration is already applied and verified.");
  } else if (presentColumns > 0 || hasConstraint) {
    throw new Error("The join-verification schema is partially present; refusing to alter an unexpected schema.");
  } else {
    const [beforeCount] = (await client.query(
      "SELECT count(*)::text AS count FROM public.telegram_communities",
    )).rows;
    const migration = await readFile(
      new URL("../migrations/0039_telegram_community_join_captcha.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration.replace(/^\s*BEGIN;\s*$/mi, "").replace(/^\s*COMMIT;\s*$/mi, ""));

    const after = await readSchemaState();
    if (!hasCompleteSchema(after)) {
      throw new Error("Join-verification migration schema verification failed.");
    }
    const [afterCount] = (await client.query(
      "SELECT count(*)::text AS count FROM public.telegram_communities",
    )).rows;
    if (beforeCount?.count !== afterCount?.count) {
      throw new Error("Existing Telegram community rows changed during the migration.");
    }
    const [nonDefaultRows] = (await client.query(
      `SELECT count(*)::text AS count
       FROM public.telegram_communities
       WHERE join_captcha_enabled IS DISTINCT FROM false
          OR join_captcha_button_text IS DISTINCT FROM 'Verify I''m human'`,
    )).rows;
    if (nonDefaultRows?.count !== "0") {
      throw new Error("Existing communities did not receive disabled join-verification defaults.");
    }

    await client.query("COMMIT");
    inTransaction = false;
    console.log("Telegram community join-verification migration applied and verified; existing records were preserved.");
  }
} catch (error) {
  if (connected && inTransaction) {
    await client.query("ROLLBACK").catch(() => {});
    inTransaction = false;
  }
  const reason = error && typeof error === "object" && "code" in error
    ? `database error ${safeErrorCode(error)}`
    : error instanceof Error && /^Expected |^The |^The connected|^The join|^Join-verification/.test(error.message)
      ? error.message
      : "unexpected runtime failure";
  throw new Error(`Telegram community join-verification migration did not complete; the transaction was rolled back (${reason}).`);
} finally {
  if (connected) await client.end();
}
