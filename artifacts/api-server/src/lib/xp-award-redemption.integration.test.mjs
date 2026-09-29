import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const requireFromDbPackage = createRequire(
  path.join(packageRoot, "../../lib/db/package.json"),
);
const { Pool } = requireFromDbPackage("pg");
const databaseBackend = process.env.DATABASE_BACKEND ?? "replit";
const connectionString =
  databaseBackend === "supabase"
    ? process.env.SUPABASE_DATABASE_URL
    : databaseBackend === "replit"
      ? process.env.DATABASE_URL
      : undefined;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findAvailablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForServer(child, baseUrl) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("The API server exited before becoming ready.");
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await delay(100);
  }
  throw new Error("The API server did not become ready within 20 seconds.");
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exitedAfterTerm = await Promise.race([
    once(child, "exit").then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (exitedAfterTerm || child.exitCode !== null || child.signalCode !== null)
    return;

  child.kill("SIGKILL");
  if (child.exitCode === null && child.signalCode === null)
    await once(child, "exit");
}

async function waitForRedemptionLockWaiters(pool, expectedCount) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      `SELECT count(*)::int AS count
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND wait_event_type = 'Lock'
         AND state = 'active'
         AND lower(query) LIKE 'update "xp_awards"%'`,
    );
    if (result.rows[0].count >= expectedCount) return result.rows[0].count;
    await delay(25);
  }
  throw new Error(
    "Both redemption requests did not overlap on the pending awards.",
  );
}

async function postRedemption(baseUrl, sessionToken) {
  const response = await fetch(`${baseUrl}/api/me/xp-awards/redeem`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

test(
  "concurrent and repeated XP redemptions credit each pending award once",
  {
    skip: connectionString
      ? false
      : `No database connection is configured for backend "${databaseBackend}".`,
    timeout: 60_000,
  },
  async (context) => {
    if (!connectionString) return;

    const pool = new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
    });
    const telegramId = `xp-redemption-test-${randomBytes(16).toString("hex")}`;
    const username = `xpr_${randomBytes(12).toString("hex")}`;
    const sessionToken = `telegram_${randomBytes(32).toString("base64url")}`;
    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
    const startBalance = 17;
    const awardAmounts = [23, 41];
    let userId;
    let awardsInserted = false;
    let sessionInserted = false;
    let apiProcess;

    try {
      const requiredRelations = [
        "users",
        "telegram_sessions",
        "xp_awards",
        "participations",
        "experiences",
        "organisations",
        "email_accounts",
      ];
      const missingRelations = await pool.query(
        `SELECT expected.name
         FROM unnest($1::text[]) AS expected(name)
         WHERE to_regclass(format('public.%I', expected.name)) IS NULL`,
        [requiredRelations],
      );
      if (missingRelations.rowCount) {
        context.skip(
          `The configured database is missing required table(s): ${missingRelations.rows
            .map(({ name }) => name)
            .join(", ")}.`,
        );
        return;
      }
      const insertedUser = await pool.query(
        `INSERT INTO users (telegram_id, name, username, user_type, xp)
         VALUES ($1, 'XP redemption integration test', $2, 'participant', $3)
         RETURNING id`,
        [telegramId, username, startBalance],
      );
      userId = insertedUser.rows[0].id;

      await pool.query(
        `INSERT INTO xp_awards (user_id, source_type, source_id, source_title, amount, status)
         VALUES
           ($1, 'experience', $2, 'XP redemption integration test A', $4, 'pending'),
           ($1, 'experience', $3, 'XP redemption integration test B', $5, 'pending')`,
        [
          userId,
          `${telegramId}-award-a`,
          `${telegramId}-award-b`,
          awardAmounts[0],
          awardAmounts[1],
        ],
      );
      awardsInserted = true;
      await pool.query(
        `INSERT INTO telegram_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '10 minutes')`,
        [userId, tokenHash],
      );
      sessionInserted = true;

      const build = spawnSync(process.execPath, ["./build.mjs"], {
        cwd: packageRoot,
        stdio: "ignore",
      });
      assert.equal(
        build.status,
        0,
        "The API server build must succeed before the route test.",
      );

      const port = await findAvailablePort();
      apiProcess = spawn(
        process.execPath,
        ["--enable-source-maps", "dist/index.mjs"],
        {
          cwd: packageRoot,
          env: { ...process.env, NODE_ENV: "test", PORT: String(port) },
          stdio: "ignore",
        },
      );
      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(apiProcess, baseUrl);

      const lockClient = await pool.connect();
      let overlapError;
      let requests;
      try {
        await lockClient.query("BEGIN");
        await lockClient.query(
          "SELECT id FROM xp_awards WHERE user_id = $1 FOR UPDATE",
          [userId],
        );
        requests = [
          postRedemption(baseUrl, sessionToken),
          postRedemption(baseUrl, sessionToken),
        ];
        try {
          await waitForRedemptionLockWaiters(pool, 2);
        } catch (error) {
          overlapError = error;
        }
      } finally {
        await lockClient.query("ROLLBACK");
        lockClient.release();
      }

      const concurrentResponses = await Promise.all(requests);
      if (overlapError) throw overlapError;

      const redeemedAmounts = concurrentResponses
        .map((response) => response.redeemedXp)
        .sort((left, right) => left - right);
      const pendingTotal = awardAmounts.reduce(
        (sum, amount) => sum + amount,
        0,
      );
      assert.deepEqual(redeemedAmounts, [0, pendingTotal]);

      const afterConcurrentRedemptions = await pool.query(
        `SELECT users.xp,
                count(xp_awards.id)::int AS award_count,
                count(xp_awards.id) FILTER (
                  WHERE xp_awards.status = 'redeemed' AND xp_awards.redeemed_at IS NOT NULL
                )::int AS redeemed_count
         FROM users
         JOIN xp_awards ON xp_awards.user_id = users.id
         WHERE users.id = $1
         GROUP BY users.id`,
        [userId],
      );
      assert.equal(
        afterConcurrentRedemptions.rows[0].xp,
        startBalance + pendingTotal,
      );
      assert.equal(
        afterConcurrentRedemptions.rows[0].award_count,
        awardAmounts.length,
      );
      assert.equal(
        afterConcurrentRedemptions.rows[0].redeemed_count,
        awardAmounts.length,
      );

      const retry = await postRedemption(baseUrl, sessionToken);
      assert.equal(retry.redeemedXp, 0);
      assert.equal(retry.user.xp, startBalance + pendingTotal);

      const finalBalance = await pool.query(
        "SELECT xp FROM users WHERE id = $1",
        [userId],
      );
      assert.equal(finalBalance.rows[0].xp, startBalance + pendingTotal);
    } finally {
      try {
        if (apiProcess) await stopServer(apiProcess);
        if (userId !== undefined) {
          const cleanupClient = await pool.connect();
          try {
            await cleanupClient.query("BEGIN");
            if (sessionInserted) {
              await cleanupClient.query(
                "DELETE FROM telegram_sessions WHERE user_id = $1",
                [userId],
              );
            }
            if (awardsInserted) {
              await cleanupClient.query(
                "DELETE FROM xp_awards WHERE user_id = $1",
                [userId],
              );
            }
            await cleanupClient.query("DELETE FROM users WHERE id = $1", [
              userId,
            ]);
            await cleanupClient.query("COMMIT");
          } catch (error) {
            await cleanupClient.query("ROLLBACK");
            throw error;
          } finally {
            cleanupClient.release();
          }
        }
      } finally {
        await pool.end();
      }
    }
  },
);
