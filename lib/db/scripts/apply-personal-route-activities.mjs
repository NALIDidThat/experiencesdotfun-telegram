import { readFile } from "node:fs/promises";
import pg from "pg";

const approval = "--approve-production-experiences-dot-fun";
if (!process.argv.includes(approval)) {
  throw new Error(`Explicit approval required; rerun with ${approval} only after approval.`);
}
if (
  process.env.REPLIT_ENVIRONMENT !== "production"
  || process.env.DATABASE_BACKEND !== "supabase"
  || !process.env.SUPABASE_DATABASE_URL
) {
  throw new Error("Expected the approved production Supabase runtime. Refusing to change a different database.");
}

const databaseUrl = new URL(process.env.SUPABASE_DATABASE_URL);
if (!databaseUrl.hostname.endsWith(".pooler.supabase.com") || databaseUrl.port !== "5432") {
  throw new Error("Expected the Supabase Session Pooler on port 5432. Refusing to connect.");
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
const tableNames = ["personal_activities", "personal_activity_points"];
const expectedColumns = {
  personal_activities: [
    ["id", "integer", "NO"],
    ["user_id", "integer", "NO"],
    ["title", "text", "NO"],
    ["goal", "text", "NO"],
    ["activity_type", "text", "NO"],
    ["destination", "text", "NO"],
    ["plan_summary", "text", "NO"],
    ["plan_tips", "jsonb", "NO"],
    ["route_polyline", "text", "NO"],
    ["planned_distance_meters", "integer", "NO"],
    ["planned_duration_seconds", "integer", "YES"],
    ["planned_ascent_meters", "integer", "YES"],
    ["elevation_profile", "jsonb", "NO"],
    ["status", "text", "NO"],
    ["started_at", "timestamp with time zone", "YES"],
    ["paused_at", "timestamp with time zone", "YES"],
    ["paused_seconds", "integer", "NO"],
    ["ended_at", "timestamp with time zone", "YES"],
    ["elapsed_seconds", "integer", "YES"],
    ["distance_meters", "integer", "YES"],
    ["average_pace_seconds_per_km", "integer", "YES"],
    ["average_speed_meters_per_second", "double precision", "YES"],
    ["total_ascent_meters", "integer", "YES"],
    ["created_at", "timestamp with time zone", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
  ],
  personal_activity_points: [
    ["activity_id", "integer", "NO"],
    ["sequence", "integer", "NO"],
    ["latitude", "double precision", "NO"],
    ["longitude", "double precision", "NO"],
    ["accuracy_meters", "double precision", "YES"],
    ["recorded_at", "timestamp with time zone", "NO"],
  ],
};
const expectedIndexes = new Set([
  "personal_activities_pkey",
  "personal_activities_owner_created_idx",
  "personal_activities_owner_status_idx",
  "personal_activity_points_pkey",
]);
const expectedConstraints = new Set([
  "personal_activities_pkey",
  "personal_activities_user_id_fkey",
  "personal_activities_goal_length_check",
  "personal_activities_title_length_check",
  "personal_activities_destination_length_check",
  "personal_activities_type_check",
  "personal_activities_status_check",
  "personal_activities_metrics_check",
  "personal_activities_tips_array_check",
  "personal_activities_elevation_array_check",
  "personal_activity_points_pkey",
  "personal_activity_points_activity_id_fkey",
  "personal_activity_points_coordinate_check",
  "personal_activity_points_sequence_check",
]);

async function readSchemaState() {
  const existence = (await client.query(`
    SELECT
      to_regclass('public.personal_activities') IS NOT NULL AS activities,
      to_regclass('public.personal_activity_points') IS NOT NULL AS points
  `)).rows[0];
  const columns = (await client.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [tableNames])).rows;
  const indexes = (await client.query(`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = ANY($1::text[])
  `, [tableNames])).rows;
  const constraints = (await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid IN (to_regclass('public.personal_activities'), to_regclass('public.personal_activity_points'))
  `)).rows;
  return { existence, columns, indexes, constraints };
}

function assertCompleteSchema(state) {
  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    const actual = new Set(
      state.columns
        .filter((column) => column.table_name === tableName)
        .map((column) => `${column.column_name}|${column.data_type}|${column.is_nullable}`),
    );
    if (columns.some((column) => !actual.has(column.join("|")))) {
      throw new Error(`Unexpected column shape for ${tableName}.`);
    }
  }

  const actualIndexes = new Set(state.indexes.map((index) => index.indexname));
  if ([...expectedIndexes].some((index) => !actualIndexes.has(index))) {
    throw new Error("The personal-route indexes do not match the migration.");
  }

  const actualConstraints = new Map(
    state.constraints.map((constraint) => [constraint.conname, constraint.definition.toLowerCase().replaceAll('"', "").replace(/\s+/g, " ").trim()]),
  );
  if ([...expectedConstraints].some((constraint) => !actualConstraints.has(constraint))) {
    throw new Error("The personal-route constraints do not match the migration.");
  }

  const allowedValues = (name) => {
    const definition = actualConstraints.get(name);
    return new Set([...definition.matchAll(/'((?:''|[^'])*)'/g)].map((match) => match[1].replaceAll("''", "'")));
  };
  const exactSet = (actual, expected) => (
    actual.size === expected.length && expected.every((value) => actual.has(value))
  );
  if (!exactSet(allowedValues("personal_activities_type_check"), ["walk", "run", "cycle"])) {
    throw new Error("The activity-type constraint does not match the approved values.");
  }
  if (!exactSet(allowedValues("personal_activities_status_check"), ["planned", "recording", "paused", "completed", "discarded"])) {
    throw new Error("The activity-status constraint does not match the approved values.");
  }
}

let inTransaction = false;
let migrationStage = "connect";
try {
  await client.connect();
  if (process.argv.includes("--inspect-only")) {
    const state = await readSchemaState();
    console.log(JSON.stringify({
      tables: state.existence,
      columns: state.columns.map(({ table_name, column_name }) => `${table_name}.${column_name}`),
      indexes: state.indexes.map(({ indexname }) => indexname),
      constraints: state.constraints.map(({ conname }) => conname),
    }));
  } else {
    migrationStage = "inspect";
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SELECT pg_advisory_xact_lock(5190034)");

    const before = await client.query(`
      SELECT
        (SELECT count(*)::text FROM users) AS users,
        (SELECT count(*)::text FROM experiences) AS experiences
    `);
    const existingState = await readSchemaState();

    if (existingState.existence.activities && existingState.existence.points) {
      migrationStage = "verify";
      assertCompleteSchema(existingState);
      await client.query("COMMIT");
      inTransaction = false;
      console.log("Personal route migration was already applied; both tables, columns, indexes, and constraints were verified.");
    } else {
      if (existingState.existence.activities || existingState.existence.points) {
        throw new Error("Only part of the personal-route schema exists; refusing to apply the migration.");
      }

      const migration = await readFile(
        new URL("../migrations/0034_personal_route_activities.sql", import.meta.url),
        "utf8",
      );
      if (!/^BEGIN;\s*$/m.test(migration) || !/^COMMIT;\s*$/m.test(migration)) {
        throw new Error("The personal-route migration is missing its transaction boundaries.");
      }
      const migrationStatements = migration
        .replace(/^BEGIN;\s*$/m, "")
        .replace(/^COMMIT;\s*$/m, "");
      migrationStage = "apply";
      await client.query(migrationStatements);

      migrationStage = "verify";
      const afterState = await readSchemaState();
      if (!afterState.existence.activities || !afterState.existence.points) {
        throw new Error("The personal-route tables were not created.");
      }
      assertCompleteSchema(afterState);

      const after = await client.query(`
        SELECT
          (SELECT count(*)::text FROM users) AS users,
          (SELECT count(*)::text FROM experiences) AS experiences,
          (SELECT count(*) FROM personal_activities) AS activities,
          (SELECT count(*) FROM personal_activity_points) AS points
      `);
      if (
        after.rows[0].users !== before.rows[0].users
        || after.rows[0].experiences !== before.rows[0].experiences
        || Number(after.rows[0].activities) !== 0
        || Number(after.rows[0].points) !== 0
      ) {
        throw new Error("Post-migration checks failed; existing row counts changed or new tables were not empty.");
      }

      await client.query("COMMIT");
      inTransaction = false;
      console.log("Personal route migration applied; schema verified and existing user and experience row counts were preserved.");
    }
  }
} catch (error) {
  if (inTransaction) await client.query("ROLLBACK").catch(() => {});
  const code = error && typeof error === "object" && "code" in error ? ` (PostgreSQL ${error.code})` : "";
  const safeMessages = new Set([
    "Only part of the personal-route schema exists; refusing to apply the migration.",
    "The personal-route migration is missing its transaction boundaries.",
    "The personal-route tables were not created.",
    "The personal-route indexes do not match the migration.",
    "The personal-route constraints do not match the migration.",
    "The activity-type constraint does not match the approved values.",
    "The activity-status constraint does not match the approved values.",
    "Post-migration checks failed; existing row counts changed or new tables were not empty.",
  ]);
  const message = error instanceof Error && safeMessages.has(error.message) ? `: ${error.message}` : "";
  console.error(`Personal route migration failed during ${migrationStage}${code}${message}. No connection details were logged.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
