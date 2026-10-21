// Runs only in an isolated, disposable schema of the built-in DEVELOPMENT
// database. Never uses SUPABASE_DATABASE_URL or changes the app's database.
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const dbRequire = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = dbRequire("pg");
if (!process.env.DATABASE_URL) throw new Error("Built-in development DATABASE_URL is required for isolated tests.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = `fundraising_test_${randomBytes(8).toString("hex")}`;
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = new URL("../generated-artifacts/fundraising-integration.mjs", import.meta.url);
const connection = new URL(process.env.DATABASE_URL);
connection.searchParams.set("options", `-c search_path=${schema}`);
try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE users (
        id serial PRIMARY KEY, telegram_id text NOT NULL, name text NOT NULL, username text,
        avatar_url text, bio text, city text, country text, interests text[] NOT NULL DEFAULT '{}',
        social_links jsonb NOT NULL DEFAULT '{}', participation_type text, user_type text,
        xp integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE organisations (
        id serial PRIMARY KEY, owner_user_id integer NOT NULL REFERENCES users(id), name text NOT NULL,
        description text, city text, country text, categories text[] NOT NULL DEFAULT '{}', organisation_type text,
        verified boolean NOT NULL DEFAULT false, legacy_verified boolean NOT NULL DEFAULT false,
        verification_status text NOT NULL DEFAULT 'unsubmitted', verification_submitted_at timestamptz,
        verification_reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE telegram_sessions (
        id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id), token_hash text NOT NULL,
        expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE analytics_events (category text CONSTRAINT analytics_events_category_check CHECK (category='other'));
      CREATE TABLE experiences (id serial PRIMARY KEY, organisation_id integer REFERENCES organisations(id), title text);
      CREATE TABLE participations (id serial PRIMARY KEY, experience_id integer REFERENCES experiences(id), user_id integer REFERENCES users(id));
    `);
    for (const name of ["0013_organisation_funds.sql", "0014_organisation_treasuries.sql", "0019_fund_contribution_ledger.sql", "0020_fund_experience_link.sql"]) {
      await client.query(await readFile(`${root}/lib/db/migrations/${name}`, "utf8"));
    }
    // The new migration is safe to re-run, and never rewrites old financial rows.
    await client.query(await readFile(`${root}/lib/db/migrations/0019_fund_contribution_ledger.sql`, "utf8"));
  } finally { client.release(); }
  await mkdir(new URL("../generated-artifacts/", import.meta.url), { recursive: true });
  const workspace = {
    "@workspace/db": `${root}/lib/db/src/index.ts`,
    "@workspace/db/schema": `${root}/lib/db/src/schema/index.ts`,
    "@workspace/api-zod": `${root}/lib/api-zod/src/index.ts`,
  };
  await build({
    entryPoints: [fileURLToPath(new URL("./fund-ledger.integration.ts", import.meta.url))],
    outfile: fileURLToPath(output), platform: "node", format: "esm", bundle: true, packages: "external",
    banner: { js: "import { createRequire as testCreateRequire } from 'node:module'; const require = testCreateRequire(import.meta.url);" },
    plugins: [{
      name: "workspace-test-imports",
      setup(builder) {
        builder.onResolve({ filter: /^@workspace\// }, (args) => {
          if (!workspace[args.path]) throw new Error(`Unexpected workspace dependency: ${args.path}`);
          return { path: workspace[args.path] };
        });
        builder.onResolve({ filter: /^pg$/ }, () => ({ path: dbRequire.resolve("pg"), external: true }));
        builder.onResolve({ filter: /^drizzle-zod$/ }, () => ({ path: dbRequire.resolve("drizzle-zod") }));
        builder.onResolve({ filter: /\/logger$/ }, () => ({ path: "test-logger", namespace: "fundraising-test" }));
        builder.onLoad({ filter: /^test-logger$/, namespace: "fundraising-test" }, () => ({
          contents: "export const logger = {info(){},warn(){},error(){},debug(){}};",
        }));
      },
    }],
  });
  const result = spawnSync(process.execPath, [fileURLToPath(output)], {
    env: { ...process.env, DATABASE_BACKEND: "replit", DATABASE_URL: connection.toString(), NODE_ENV: "test", TELEGRAM_POLLING_ENABLED: "false" },
    stdio: "inherit", timeout: 120_000,
  });
  if (result.status !== 0) throw new Error("Fundraising integration test failed.");
} finally {
  // Random, generated schema identifier only: never drop public or user data.
  if (!/^fundraising_test_[0-9a-f]{16}$/.test(schema)) throw new Error("Unsafe test schema identifier.");
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
  await rm(output, { force: true });
}
