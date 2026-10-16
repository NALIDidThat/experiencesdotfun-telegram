import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
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
  databaseBackend === "supabase" ? process.env.SUPABASE_DATABASE_URL : undefined;
const skipReason =
  process.env.RUN_CONNECTIONS_INTEGRATION !== "1"
    ? "Set RUN_CONNECTIONS_INTEGRATION=1 to run the isolated connections integration test."
    : databaseBackend !== "supabase"
      ? "The connections integration test requires DATABASE_BACKEND=supabase."
      : !connectionString
        ? "SUPABASE_DATABASE_URL is not configured."
        : false;

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
      throw new Error("The API test server exited before becoming ready.");
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The API process may still be starting.
    }
    await delay(100);
  }
  throw new Error("The API test server did not become ready within 20 seconds.");
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

async function requestJson(baseUrl, pathname, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

async function relationshipCounts(pool, userIds) {
  const [friendships, accountability] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS count
       FROM friendships
       WHERE requester_user_id = ANY($1::int[])
          OR recipient_user_id = ANY($1::int[])`,
      [userIds],
    ),
    pool.query(
      `SELECT count(*)::int AS count
       FROM accountability_partnerships
       WHERE requester_user_id = ANY($1::int[])
          OR recipient_user_id = ANY($1::int[])`,
      [userIds],
    ),
  ]);
  return {
    friendships: friendships.rows[0].count,
    accountabilityPartnerships: accountability.rows[0].count,
  };
}

async function removeFixtures(pool, userIds) {
  if (userIds.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM telegram_sessions WHERE user_id = ANY($1::int[])`,
      [userIds],
    );
    await client.query(
      `DELETE FROM pinned_friends
       WHERE user_id = ANY($1::int[]) OR friend_user_id = ANY($1::int[])`,
      [userIds],
    );
    await client.query(
      `DELETE FROM organisation_partnerships
       WHERE requester_user_id = ANY($1::int[]) OR recipient_user_id = ANY($1::int[])`,
      [userIds],
    );
    await client.query(
      `DELETE FROM friendships
       WHERE requester_user_id = ANY($1::int[]) OR recipient_user_id = ANY($1::int[])`,
      [userIds],
    );
    await client.query(
      `DELETE FROM accountability_partnerships
       WHERE requester_user_id = ANY($1::int[]) OR recipient_user_id = ANY($1::int[])`,
      [userIds],
    );
    await client.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [userIds]);
    await client.query("COMMIT");
    const remaining = await client.query(
      `SELECT count(*)::int AS count FROM users WHERE id = ANY($1::int[])`,
      [userIds],
    );
    assert.equal(remaining.rows[0].count, 0, "Temporary test profiles were removed.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

test(
  "signed-in profile connections stay ordered, role-scoped, and separate from other relationships",
  { skip: skipReason, timeout: 90_000 },
  async (context) => {
    const pool = new Pool({
      connectionString,
      max: 4,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
    });
    let apiProcess;
    let userIds = [];

    try {
      const requiredRelations = [
        "users",
        "telegram_sessions",
        "friendships",
        "pinned_friends",
        "organisation_partnerships",
        "accountability_partnerships",
      ];
      const missingRelations = await pool.query(
        `SELECT expected.name
         FROM unnest($1::text[]) AS expected(name)
         WHERE to_regclass(format('public.%I', expected.name)) IS NULL`,
        [requiredRelations],
      );
      if (missingRelations.rowCount) {
        context.skip(
          `The selected database is missing required relations: ${missingRelations.rows
            .map(({ name }) => name)
            .join(", ")}.`,
        );
        return;
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

      const nonce = randomBytes(8).toString("hex");
      const ownerTelegramId = `connections-test-owner-${nonce}`;
      const userSpecs = [
        { key: "participant", telegramId: ownerTelegramId, userType: "participant" },
        { key: "organisation", telegramId: ownerTelegramId, userType: "organisation" },
        { key: "siblingOrganisation", telegramId: ownerTelegramId, userType: "organisation" },
        ...["friend1", "friend2", "friend3", "friend4", "notFriend"].map((key) => ({
          key,
          telegramId: `connections-test-${nonce}-${key}`,
          userType: "participant",
        })),
        { key: "acceptingOrganisation", telegramId: `connections-test-${nonce}-accepting`, userType: "organisation" },
        { key: "decliningOrganisation", telegramId: `connections-test-${nonce}-declining`, userType: "organisation" },
      ].map((user) => ({
        ...user,
        name: `Connections test ${user.key}`,
        username: `cf${nonce}${user.key}`,
      }));

      const userValues = userSpecs.flatMap(({ telegramId, name, username, userType }) => [
        telegramId,
        name,
        username,
        userType,
      ]);
      const userPlaceholders = userSpecs.map((_, index) => {
        const first = index * 4 + 1;
        return `($${first}, $${first + 1}, $${first + 2}, $${first + 3})`;
      });
      const createdUsers = await pool.query(
        `INSERT INTO users (telegram_id, name, username, user_type)
         VALUES ${userPlaceholders.join(", ")}
         RETURNING id, username`,
        userValues,
      );
      userIds = createdUsers.rows.map((user) => user.id);
      const userIdByKey = new Map(
        userSpecs.map((spec) => [
          spec.key,
          createdUsers.rows.find((user) => user.username === spec.username).id,
        ]),
      );

      const friendIds = ["friend1", "friend2", "friend3", "friend4"].map(
        (key) => userIdByKey.get(key),
      );
      await pool.query(
        `INSERT INTO friendships (requester_user_id, recipient_user_id, status, accepted_at)
         VALUES ${friendIds.map((_, index) => `($1, $${index + 2}, 'accepted', now())`).join(", ")}`,
        [userIdByKey.get("participant"), ...friendIds],
      );
      const countsBefore = await relationshipCounts(pool, userIds);
      assert.deepEqual(countsBefore, { friendships: 4, accountabilityPartnerships: 0 });

      const sessionKeys = [
        "participant",
        "organisation",
        "siblingOrganisation",
        "acceptingOrganisation",
        "decliningOrganisation",
      ];
      const tokens = Object.fromEntries(
        sessionKeys.map((key) => [
          key,
          `telegram_${randomBytes(32).toString("base64url")}`,
        ]),
      );
      const sessionValues = sessionKeys.flatMap((key) => [
        userIdByKey.get(key),
        createHash("sha256").update(tokens[key]).digest("hex"),
      ]);
      const sessionPlaceholders = sessionKeys.map((_, index) => {
        const first = index * 2 + 1;
        return `($${first}, $${first + 1}, now() + interval '10 minutes')`;
      });
      await pool.query(
        `INSERT INTO telegram_sessions (user_id, token_hash, expires_at)
         VALUES ${sessionPlaceholders.join(", ")}`,
        sessionValues,
      );

      const participantId = userIdByKey.get("participant");
      const orgToken = tokens.organisation;
      const participantToken = tokens.participant;
      const participantTopPath = "/api/friends/top";

      const port = await findAvailablePort();
      apiProcess = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
        cwd: packageRoot,
        env: {
          ...process.env,
          DATABASE_BACKEND: "supabase",
          NODE_ENV: "test",
          PORT: String(port),
          TELEGRAM_POLLING_ENABLED: "false",
        },
        stdio: "ignore",
      });
      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(apiProcess, baseUrl);

      const emptyPins = await requestJson(baseUrl, participantTopPath, participantToken);
      assert.equal(emptyPins.status, 200);
      assert.deepEqual(emptyPins.body, []);

      const invalidCount = await requestJson(baseUrl, participantTopPath, participantToken, {
        method: "PUT",
        body: { friendIds },
      });
      assert.equal(invalidCount.status, 400, "More than three friends cannot be pinned.");

      const rejectedUnaccepted = await requestJson(baseUrl, participantTopPath, participantToken, {
        method: "PUT",
        body: { friendIds: [userIdByKey.get("notFriend")] },
      });
      assert.equal(rejectedUnaccepted.status, 409, "Only accepted friends can be pinned.");

      const firstOrder = friendIds.slice(0, 3);
      const savedPins = await requestJson(baseUrl, participantTopPath, participantToken, {
        method: "PUT",
        body: { friendIds: firstOrder },
      });
      assert.equal(savedPins.status, 200);
      assert.deepEqual(savedPins.body.map((friend) => friend.id), firstOrder);

      const reopenedPins = await requestJson(baseUrl, participantTopPath, participantToken);
      assert.equal(reopenedPins.status, 200);
      assert.deepEqual(
        reopenedPins.body.map((friend) => friend.id),
        firstOrder,
        "A fresh request returns the saved order.",
      );

      const reorderedIds = [friendIds[2], friendIds[0], friendIds[1]];
      const reordered = await requestJson(baseUrl, participantTopPath, participantToken, {
        method: "PUT",
        body: { friendIds: reorderedIds },
      });
      assert.equal(reordered.status, 200);
      const reopenedReordered = await requestJson(baseUrl, participantTopPath, participantToken);
      assert.deepEqual(
        reopenedReordered.body.map((friend) => friend.id),
        reorderedIds,
        "A fresh request returns the new order.",
      );

      const remainingIds = [friendIds[2], friendIds[1]];
      const removed = await requestJson(baseUrl, participantTopPath, participantToken, {
        method: "PUT",
        body: { friendIds: remainingIds },
      });
      assert.equal(removed.status, 200);
      const reopenedAfterRemoval = await requestJson(baseUrl, participantTopPath, participantToken);
      assert.deepEqual(
        reopenedAfterRemoval.body.map((friend) => friend.id),
        remainingIds,
        "Removing a friend persists without disturbing the remaining order.",
      );

      const organisationTopFriends = await requestJson(
        baseUrl,
        participantTopPath,
        orgToken,
      );
      assert.equal(organisationTopFriends.status, 200);
      assert.deepEqual(organisationTopFriends.body, []);

      const partnershipPath = "/api/organisation-partnerships";
      const recipientUsername = userSpecs.find(
        (user) => user.key === "acceptingOrganisation",
      ).username;
      const firstRequest = await requestJson(baseUrl, partnershipPath, orgToken, {
        method: "POST",
        body: { username: recipientUsername },
      });
      assert.equal(firstRequest.status, 201);
      assert.equal(firstRequest.body.status, "pending");
      const pendingId = firstRequest.body.id;

      const orgPending = await requestJson(baseUrl, partnershipPath, orgToken);
      assert.equal(orgPending.status, 200);
      assert.equal(orgPending.body.length, 1);
      assert.equal(orgPending.body[0].direction, "outgoing");

      const siblingList = await requestJson(
        baseUrl,
        partnershipPath,
        tokens.siblingOrganisation,
      );
      assert.equal(siblingList.status, 200);
      assert.deepEqual(siblingList.body, []);
      const siblingCannotAccept = await requestJson(
        baseUrl,
        `${partnershipPath}/${pendingId}/accept`,
        tokens.siblingOrganisation,
        { method: "POST" },
      );
      assert.equal(siblingCannotAccept.status, 404);

      const participantCannotList = await requestJson(
        baseUrl,
        partnershipPath,
        participantToken,
      );
      assert.equal(participantCannotList.status, 409);
      const participantCannotSend = await requestJson(
        baseUrl,
        partnershipPath,
        participantToken,
        { method: "POST", body: { username: recipientUsername } },
      );
      assert.equal(participantCannotSend.status, 409);
      for (const action of ["accept", "decline", "end"]) {
        const participantAction = await requestJson(
          baseUrl,
          `${partnershipPath}/${pendingId}/${action}`,
          participantToken,
          { method: "POST" },
        );
        assert.equal(participantAction.status, 409);
      }

      const accepted = await requestJson(
        baseUrl,
        `${partnershipPath}/${pendingId}/accept`,
        tokens.acceptingOrganisation,
        { method: "POST" },
      );
      assert.equal(accepted.status, 200);
      assert.equal(accepted.body.status, "active");

      const activeList = await requestJson(baseUrl, partnershipPath, orgToken);
      assert.equal(activeList.status, 200);
      assert.deepEqual(activeList.body.map((item) => item.id), [pendingId]);
      const ended = await requestJson(
        baseUrl,
        `${partnershipPath}/${pendingId}/end`,
        orgToken,
        { method: "POST" },
      );
      assert.equal(ended.status, 200);
      assert.equal(ended.body.status, "ended");

      const decliningUsername = userSpecs.find(
        (user) => user.key === "decliningOrganisation",
      ).username;
      const secondRequest = await requestJson(baseUrl, partnershipPath, orgToken, {
        method: "POST",
        body: { username: decliningUsername },
      });
      assert.equal(secondRequest.status, 201);
      const declined = await requestJson(
        baseUrl,
        `${partnershipPath}/${secondRequest.body.id}/decline`,
        tokens.decliningOrganisation,
        { method: "POST" },
      );
      assert.equal(declined.status, 200);
      assert.equal(declined.body.status, "declined");

      const finalOrgList = await requestJson(baseUrl, partnershipPath, orgToken);
      assert.equal(finalOrgList.status, 200);
      assert.deepEqual(finalOrgList.body, []);
      const finalParticipantPins = await requestJson(
        baseUrl,
        participantTopPath,
        participantToken,
      );
      assert.deepEqual(
        finalParticipantPins.body.map((friend) => friend.id),
        remainingIds,
      );

      const countsAfter = await relationshipCounts(pool, userIds);
      assert.deepEqual(
        countsAfter,
        countsBefore,
        "Organisation partnership actions do not create or alter friendships or accountability partnerships.",
      );

      const persistedPositions = await pool.query(
        `SELECT friend_user_id, position
         FROM pinned_friends
         WHERE user_id = $1
         ORDER BY position`,
        [participantId],
      );
      assert.deepEqual(
        persistedPositions.rows.map((row) => [row.friend_user_id, row.position]),
        remainingIds.map((id, position) => [id, position]),
      );
    } finally {
      try {
        if (apiProcess) await stopServer(apiProcess);
      } finally {
        try {
          await removeFixtures(pool, userIds);
        } finally {
          await pool.end();
        }
      }
    }
  },
);
