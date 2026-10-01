import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { redeemPendingXpAwards } from "./xp-award-redemption.mjs";

const dbRequire = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const pg = dbRequire("pg");
const { Pool } = pg;
const localPostgresAvailable =
  spawnSync("initdb", ["--version"], { stdio: "ignore" }).status === 0 &&
  spawnSync("postgres", ["--version"], { stdio: "ignore" }).status === 0;

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a local PostgreSQL port.");
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

test(
  "concurrent and repeated XP redemptions credit the profile only once",
  { skip: localPostgresAvailable ? false : "Local PostgreSQL binaries are unavailable." },
  async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "xp-redemption-postgres-"));
    let server;
    let pool;

    try {
      const initialized = spawnSync(
        "initdb",
        ["-D", dataDir, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"],
        { stdio: "ignore" },
      );
      assert.equal(initialized.status, 0, "temporary PostgreSQL cluster should initialize");

      const port = await getFreePort();
      server = spawn(
        "postgres",
        [
          "-D",
          dataDir,
          "-h",
          "127.0.0.1",
          "-p",
          String(port),
          "-c",
          "fsync=off",
          "-c",
          "unix_socket_directories=/tmp",
        ],
        { stdio: "ignore" },
      );
      pool = new Pool({
        connectionString: `postgres://postgres@127.0.0.1:${port}/postgres`,
        connectionTimeoutMillis: 500,
        max: 4,
      });

      let ready = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (server.exitCode !== null) {
          throw new Error("Temporary PostgreSQL server exited before becoming ready.");
        }
        try {
          await pool.query("SELECT 1");
          ready = true;
          break;
        } catch {
          await delay(100);
        }
      }
      assert.ok(ready, "temporary PostgreSQL server should accept connections");

      await pool.query(`
        CREATE TABLE public.users (
          id serial PRIMARY KEY,
          xp integer NOT NULL DEFAULT 0,
          updated_at timestamp with time zone NOT NULL DEFAULT now()
        );
        CREATE TABLE public.xp_awards (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES public.users(id),
          amount integer NOT NULL,
          source_title text NOT NULL DEFAULT 'Experience reward',
          status text NOT NULL DEFAULT 'pending',
          redeemed_at timestamp with time zone
        );
        CREATE TABLE public.feed_preferences (
          user_id integer PRIMARY KEY REFERENCES public.users(id),
          share_activity_with_friends boolean NOT NULL DEFAULT false
        );
        CREATE TABLE public.activity_events (
          id serial PRIMARY KEY,
          actor_id integer NOT NULL REFERENCES public.users(id),
          type text NOT NULL,
          target_type text NOT NULL,
          target_id integer NOT NULL,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          visibility text NOT NULL,
          created_at timestamp with time zone NOT NULL,
          UNIQUE (actor_id, type, target_type, target_id)
        );
      `);
      const { rows: [profile] } = await pool.query(
        "INSERT INTO public.users (xp) VALUES (100) RETURNING id",
      );
      await pool.query(
        `INSERT INTO public.xp_awards (user_id, amount, source_title, status, redeemed_at)
         VALUES ($1, 17, 'Experience reward', 'redeemed', now()),
                ($1, 25, 'Experience reward', 'pending', NULL),
                ($1, 35, 'Experience reward', 'pending', NULL)`,
        [profile.id],
      );

      const redemptions = await Promise.all([
        redeemPendingXpAwards(pool, profile.id),
        redeemPendingXpAwards(pool, profile.id),
      ]);
      assert.deepEqual(
        redemptions.map(({ redeemedXp }) => redeemedXp).sort((a, b) => a - b),
        [0, 60],
      );
      assert.equal(
        redemptions.reduce((total, redemption) => total + redemption.redeemedXp, 0),
        60,
      );

      const { rows: [afterConcurrentRedemptions] } = await pool.query(
        "SELECT xp FROM public.users WHERE id = $1",
        [profile.id],
      );
      assert.equal(afterConcurrentRedemptions.xp, 160);

      const retry = await redeemPendingXpAwards(pool, profile.id);
      assert.deepEqual(retry, { redeemedXp: 0, balanceXp: 160 });
      const { rows: [afterRetry] } = await pool.query(
        "SELECT xp FROM public.users WHERE id = $1",
        [profile.id],
      );
      assert.equal(afterRetry.xp, 160);

      const { rows: privateEvents } = await pool.query(
        `SELECT type, target_type, visibility, metadata
         FROM public.activity_events
         WHERE actor_id = $1
         ORDER BY target_id`,
        [profile.id],
      );
      assert.equal(privateEvents.length, 2);
      assert.deepEqual(
        privateEvents.map((event) => event.visibility),
        ["private", "private"],
      );
      assert.ok(privateEvents.every((event) => event.type === "xp_earned"));
      assert.ok(privateEvents.every((event) => event.target_type === "xp_award"));
      assert.equal(Number(privateEvents[0].metadata.amount), 25);

      const { rows: [optedInProfile] } = await pool.query(
        "INSERT INTO public.users (xp) VALUES (0) RETURNING id",
      );
      await pool.query(
        "INSERT INTO public.feed_preferences (user_id, share_activity_with_friends) VALUES ($1, true)",
        [optedInProfile.id],
      );
      await pool.query(
        "INSERT INTO public.xp_awards (user_id, amount, source_title) VALUES ($1, 10, 'Neighbourhood clean-up')",
        [optedInProfile.id],
      );
      const optedInRedemption = await redeemPendingXpAwards(pool, optedInProfile.id);
      assert.deepEqual(optedInRedemption, { redeemedXp: 10, balanceXp: 10 });
      const { rows: [sharedEvent] } = await pool.query(
        "SELECT visibility, metadata FROM public.activity_events WHERE actor_id = $1",
        [optedInProfile.id],
      );
      assert.equal(sharedEvent.visibility, "friends");
      assert.deepEqual(sharedEvent.metadata, {
        amount: 10,
        sourceTitle: "Neighbourhood clean-up",
      });
    } finally {
      if (pool) await pool.end();
      if (server && server.exitCode === null) {
        server.kill("SIGTERM");
        await Promise.race([once(server, "exit"), delay(3000)]);
        if (server.exitCode === null) server.kill("SIGKILL");
      }
      await rm(dataDir, { recursive: true, force: true });
    }
  },
);