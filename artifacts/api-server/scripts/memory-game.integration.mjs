// Runs only in an isolated schema of the built-in development database.
// It must never connect to the shared Supabase database or production data.
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

if (process.env.DATABASE_BACKEND !== "replit") {
  throw new Error("Memory Game integration tests require DATABASE_BACKEND=replit.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("Memory Game integration tests require the built-in development DATABASE_URL.");
}
const databaseUrl = new URL(process.env.DATABASE_URL);
if (/supabase/i.test(databaseUrl.hostname)) {
  throw new Error("Memory Game integration tests cannot use a Supabase database.");
}

const dbRequire = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = dbRequire("pg");
const pool = new Pool({ connectionString: databaseUrl.toString() });
const schema = `memory_game_test_${randomBytes(8).toString("hex")}`;
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = new URL("../generated-artifacts/memory-game.integration.mjs", import.meta.url);
const connection = new URL(databaseUrl);
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
        xp integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE telegram_sessions (
        id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id),
        token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE friendships (
        id serial PRIMARY KEY, requester_user_id integer NOT NULL REFERENCES users(id),
        recipient_user_id integer NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz,
        social_invite_id integer,
        UNIQUE (requester_user_id, recipient_user_id)
      );
      CREATE TABLE xp_awards (
        id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id),
        source_type text NOT NULL, source_id text NOT NULL, source_title text NOT NULL,
        amount integer NOT NULL, status text NOT NULL DEFAULT 'pending',
        awarded_at timestamptz NOT NULL DEFAULT now(), redeemed_at timestamptz,
        UNIQUE (user_id, source_type, source_id)
      );
    `);
    await client.query(await readFile(`${root}/lib/db/migrations/0010_memory_game.sql`, "utf8"));
    await client.query(await readFile(`${root}/lib/db/migrations/0011_memory_game_level_100.sql`, "utf8"));
  } finally {
    client.release();
  }

  await mkdir(new URL("../generated-artifacts/", import.meta.url), { recursive: true });
  const workspace = {
    "@workspace/db": `${root}/lib/db/src/index.ts`,
    "@workspace/db/schema": `${root}/lib/db/src/schema/index.ts`,
    "@workspace/api-zod": `${root}/lib/api-zod/src/index.ts`,
  };
  await build({
    entryPoints: [fileURLToPath(new URL("./memory-game.integration.ts", import.meta.url))],
    outfile: fileURLToPath(output),
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    banner: { js: "import { createRequire as testCreateRequire } from 'node:module'; const require = testCreateRequire(import.meta.url);" },
    plugins: [{
      name: "memory-game-test-imports",
      setup(builder) {
        builder.onResolve({ filter: /^@workspace\// }, (args) => {
          if (!workspace[args.path]) throw new Error(`Unexpected workspace dependency: ${args.path}`);
          return { path: workspace[args.path] };
        });
        builder.onResolve({ filter: /^pg$/ }, () => ({ path: dbRequire.resolve("pg"), external: true }));
        builder.onResolve({ filter: /^drizzle-zod$/ }, () => ({ path: dbRequire.resolve("drizzle-zod") }));
        builder.onResolve({ filter: /\/logger$/ }, () => ({ path: "memory-game-test-logger", namespace: "memory-game-test" }));
        builder.onLoad({ filter: /^memory-game-test-logger$/, namespace: "memory-game-test" }, () => ({
          contents: "export const logger = {info(){},warn(){},error(){},debug(){}};",
        }));
      },
    }],
  });

  const result = spawnSync(process.execPath, [fileURLToPath(output)], {
    env: {
      ...process.env,
      DATABASE_BACKEND: "replit",
      DATABASE_URL: connection.toString(),
      NODE_ENV: "test",
      TELEGRAM_POLLING_ENABLED: "false",
    },
    stdio: "inherit",
    timeout: 120_000,
  });
  if (result.status !== 0) throw new Error("Memory Game integration test failed.");
} finally {
  if (!/^memory_game_test_[0-9a-f]{16}$/.test(schema)) {
    throw new Error("Unsafe Memory Game test schema identifier.");
  }
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
  await rm(output, { force: true });
}
