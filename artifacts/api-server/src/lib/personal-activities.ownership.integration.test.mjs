import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const root = path.resolve(packageRoot, "../..");
const requireFromDbPackage = createRequire(
  path.join(packageRoot, "../../lib/db/package.json"),
);
const { Pool } = requireFromDbPackage("pg");
const skipReason =
  process.env.DATABASE_BACKEND !== "replit"
    ? "The isolated route ownership test requires DATABASE_BACKEND=replit."
    : !process.env.DATABASE_URL
      ? "The isolated route ownership test requires the built-in development DATABASE_URL."
      : /supabase/i.test(new URL(process.env.DATABASE_URL).hostname)
        ? "The isolated route ownership test cannot use a Supabase database."
        : false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      if ((await fetch(`${baseUrl}/api/healthz`)).ok) return;
    } catch {
      // The API process may still be starting.
    }
    await delay(100);
  }
  throw new Error("The API server did not become ready within 20 seconds.");
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (exited || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGKILL");
  if (child.exitCode === null && child.signalCode === null) {
    await once(child, "exit");
  }
}

async function request(baseUrl, pathname, token, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: response.status === 204 ? undefined : await response.json(),
  };
}

function assertStatus(result, expected, message) {
  assert.equal(result.status, expected, message ?? JSON.stringify(result.body));
}

test(
  "personal route records remain private to the selected owner profile",
  { skip: skipReason, timeout: 120_000 },
  async () => {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    const pool = new Pool({ connectionString: databaseUrl.toString(), max: 3 });
    const schema = `personal_routes_test_${randomBytes(8).toString("hex")}`;
    const schemaConnection = new URL(databaseUrl);
    schemaConnection.searchParams.set("options", `-c search_path=${schema}`);
    const nonce = randomBytes(8).toString("hex");
    const telegramId = `personal-routes-${nonce}`;
    const ownerToken = `telegram_${randomBytes(32).toString("base64url")}`;
    const siblingToken = `telegram_${randomBytes(32).toString("base64url")}`;
    const ownerTokenHash = createHash("sha256").update(ownerToken).digest("hex");
    const siblingTokenHash = createHash("sha256").update(siblingToken).digest("hex");
    const privateGoal = `private route goal sentinel ${nonce}`;
    const privateDestination = `private route destination sentinel ${nonce}`;
    const privateError = `private database error sentinel ${nonce}`;
    const privateLatitude = -33.865143;
    const privateLongitude = 151.2099;
    let serverProcess;
    let output = "";

    try {
      await pool.query(`CREATE SCHEMA "${schema}"`);
      const client = await pool.connect();
      let ownerId;
      let siblingId;
      let activityId;
      let failureActivityId;
      try {
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(`
          CREATE TABLE users (
            id serial PRIMARY KEY,
            telegram_id text NOT NULL,
            name text NOT NULL,
            username text,
            avatar_url text,
            bio text,
            city text,
            country text,
            interests text[] NOT NULL DEFAULT '{}',
            social_links jsonb NOT NULL DEFAULT '{}',
            participation_type text,
            user_type text,
            xp integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE telegram_sessions (
            id serial PRIMARY KEY,
            user_id integer NOT NULL REFERENCES users(id),
            token_hash text NOT NULL UNIQUE,
            expires_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          );
        `);
        await client.query(
          await readFile(path.join(root, "lib/db/migrations/0034_personal_route_activities.sql"), "utf8"),
        );
        const owner = await client.query(
          `INSERT INTO users (telegram_id, name, username, user_type)
           VALUES ($1, 'Route owner profile', $2, 'participant') RETURNING id`,
          [telegramId, `route_owner_${nonce}`],
        );
        ownerId = owner.rows[0].id;
        const sibling = await client.query(
          `INSERT INTO users (telegram_id, name, username, user_type)
           VALUES ($1, 'Sibling participant profile', $2, 'participant') RETURNING id`,
          [telegramId, `route_sibling_${nonce}`],
        );
        siblingId = sibling.rows[0].id;
        await client.query(
          `INSERT INTO telegram_sessions (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + interval '10 minutes'),
                  ($3, $4, now() + interval '10 minutes')`,
          [ownerId, ownerTokenHash, siblingId, siblingTokenHash],
        );
        const seededActivities = await client.query(
          `INSERT INTO personal_activities (
             user_id, title, goal, activity_type, destination, plan_summary,
             route_polyline, planned_distance_meters, planned_duration_seconds
           )
           VALUES ($1, 'Private planned route', $2, 'walk', $3, 'A private test plan summary.',
                   '_p~iF~ps|U_ulLnnqC', 500, 300)
           RETURNING id`,
          [ownerId, privateGoal, privateDestination],
        );
        activityId = seededActivities.rows[0].id;
        const seededFailureActivity = await client.query(
          `INSERT INTO personal_activities (
             user_id, title, goal, activity_type, destination, plan_summary,
             route_polyline, planned_distance_meters, planned_duration_seconds
           )
           VALUES ($1, 'Private error route', $2, 'walk', $3, 'A private test plan summary.',
                   '_p~iF~ps|U_ulLnnqC', 500, 300)
           RETURNING id`,
          [ownerId, `${privateGoal} error`, `${privateDestination} error`],
        );
        failureActivityId = seededFailureActivity.rows[0].id;
      } finally {
        client.release();
      }

      const build = spawnSync(process.execPath, ["./build.mjs"], {
        cwd: packageRoot,
        encoding: "utf8",
      });
      assert.equal(
        build.status,
        0,
        `The API server build must succeed before the route test.\n${build.stderr}`,
      );

      const port = await findAvailablePort();
      serverProcess = spawn(
        process.execPath,
        ["--enable-source-maps", "dist/index.mjs"],
        {
          cwd: packageRoot,
          env: {
            ...process.env,
            DATABASE_BACKEND: "replit",
            DATABASE_URL: schemaConnection.toString(),
            NODE_ENV: "test",
            PORT: String(port),
            TELEGRAM_POLLING_ENABLED: "false",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      serverProcess.stdout.setEncoding("utf8").on("data", (chunk) => {
        output += chunk;
      });
      serverProcess.stderr.setEncoding("utf8").on("data", (chunk) => {
        output += chunk;
      });
      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(serverProcess, baseUrl);
      const routePath = `/api/me/personal-activities/${activityId}`;
      const pointsBody = {
        points: [
          {
            sequence: 0,
            latitude: -33.865143,
            longitude: 151.2099,
            accuracyMeters: 5,
            recordedAt: "2026-11-22T10:00:00.000Z",
          },
          {
            sequence: 1,
            latitude: -33.8653,
            longitude: 151.2101,
            accuracyMeters: 5,
            recordedAt: "2026-11-22T10:00:10.000Z",
          },
        ],
      };

      const siblingList = await request(
        baseUrl,
        "/api/me/personal-activities",
        siblingToken,
      );
      assertStatus(siblingList, 200);
      assert.deepEqual(siblingList.body, [], "A sibling profile cannot list the owner's routes.");
      assertStatus(await request(baseUrl, routePath, siblingToken), 404);
      assertStatus(
        await request(baseUrl, `${routePath}/start`, siblingToken, { method: "POST" }),
        404,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/points`, siblingToken, {
          method: "POST",
          body: pointsBody,
        }),
        404,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/finish`, siblingToken, { method: "POST" }),
        404,
      );
      assertStatus(
        await request(baseUrl, routePath, siblingToken, { method: "DELETE" }),
        404,
      );

      const ownerList = await request(
        baseUrl,
        "/api/me/personal-activities",
        ownerToken,
      );
      assertStatus(ownerList, 200);
      assert.deepEqual(
        ownerList.body.map(({ id }) => id).sort((left, right) => left - right),
        [activityId, failureActivityId].sort((left, right) => left - right),
      );
      const ownerDetail = await request(baseUrl, routePath, ownerToken);
      assertStatus(ownerDetail, 200);
      assert.equal(ownerDetail.body.goal, privateGoal);
      assert.equal(ownerDetail.body.destination, privateDestination);
      assert.deepEqual(ownerDetail.body.routePoints, []);

      assertStatus(
        await request(baseUrl, `${routePath}/start`, ownerToken, { method: "POST" }),
        200,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/pause`, siblingToken, { method: "POST" }),
        404,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/pause`, ownerToken, { method: "POST" }),
        200,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/resume`, siblingToken, { method: "POST" }),
        404,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/resume`, ownerToken, { method: "POST" }),
        200,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/points`, siblingToken, {
          method: "POST",
          body: pointsBody,
        }),
        404,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/points`, ownerToken, {
          method: "POST",
          body: pointsBody,
        }),
        200,
      );
      assertStatus(
        await request(baseUrl, `${routePath}/finish`, siblingToken, { method: "POST" }),
        404,
      );
      const finished = await request(baseUrl, `${routePath}/finish`, ownerToken, {
        method: "POST",
      });
      assertStatus(finished, 200);
      assert.equal(finished.body.status, "completed");
      assert.equal(finished.body.routePoints.length, 2);
      assertStatus(
        await request(baseUrl, routePath, siblingToken, { method: "DELETE" }),
        404,
      );
      assertStatus(await request(baseUrl, routePath, ownerToken), 200);
      assertStatus(await request(baseUrl, routePath, ownerToken, { method: "DELETE" }), 204);
      assertStatus(await request(baseUrl, routePath, ownerToken), 404);

      const failurePath = `/api/me/personal-activities/${failureActivityId}`;
      assertStatus(
        await request(baseUrl, `${failurePath}/start`, ownerToken, { method: "POST" }),
        200,
      );
      const triggerClient = await pool.connect();
      try {
        await triggerClient.query(`SET search_path TO "${schema}"`);
        await triggerClient.query(`
          CREATE FUNCTION reject_test_route_point() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'private route failure: ${privateError}; destination ${privateDestination}; coordinates ${privateLatitude}, ${privateLongitude}';
          END;
          $$;
          CREATE TRIGGER reject_test_route_point_trigger
          BEFORE INSERT ON personal_activity_points
          FOR EACH ROW EXECUTE FUNCTION reject_test_route_point();
        `);
      } finally {
        triggerClient.release();
      }
      const failedPointWrite = await request(
        baseUrl,
        `${failurePath}/points`,
        ownerToken,
        {
          method: "POST",
          body: {
            points: [{
              sequence: 0,
              latitude: privateLatitude,
              longitude: privateLongitude,
              accuracyMeters: 5,
              recordedAt: "2026-11-22T10:00:00.000Z",
            }],
          },
        },
      );
      assertStatus(failedPointWrite, 503);
      assert.equal(failedPointWrite.body.message, "Personal routes are temporarily unavailable. Please try again.");
    } finally {
      try {
        if (serverProcess) {
          await stopServer(serverProcess);
          await delay(50);
        }
      } finally {
        try {
          assert.ok(!output.includes(privateGoal), "The API must not log route goals.");
          assert.ok(!output.includes(privateDestination), "The API must not log destinations.");
          assert.ok(!output.includes(privateError), "The API must not log database error details.");
          assert.ok(
            !output.includes(`${privateLatitude}, ${privateLongitude}`),
            "The API must not log route coordinates.",
          );
        } finally {
          try {
            if (!/^personal_routes_test_[0-9a-f]{16}$/.test(schema)) {
              throw new Error("Unsafe personal route test schema identifier.");
            }
            await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          } finally {
            await pool.end();
          }
        }
      }
    }
  },
);
