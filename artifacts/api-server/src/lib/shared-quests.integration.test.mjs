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
    ? "The isolated shared-objective test requires DATABASE_BACKEND=replit."
    : !process.env.DATABASE_URL
      ? "The isolated shared-objective test requires the built-in development DATABASE_URL."
      : /supabase/i.test(new URL(process.env.DATABASE_URL).hostname)
        ? "The isolated shared-objective test cannot use a Supabase database."
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

async function waitForServer(child, baseUrl, getOutput) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The API server exited before becoming ready.\n${getOutput()}`);
    }
    try {
      if ((await fetch(`${baseUrl}/api/healthz`)).ok) return;
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
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (exited || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGKILL");
  if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
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
    body: await response.json(),
  };
}

test(
  "shared objective permissions, verified progress, rewards, and notifications are retry-safe",
  { skip: skipReason, timeout: 120_000 },
  async () => {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    const pool = new Pool({ connectionString: databaseUrl.toString(), max: 4 });
    const schema = `shared_quests_test_${randomBytes(8).toString("hex")}`;
    const schemaConnection = new URL(databaseUrl);
    schemaConnection.searchParams.set("options", `-c search_path=${schema}`);
    const nonce = randomBytes(8).toString("hex");
    const chatId = `-100${randomBytes(6).readUIntBE(0, 6)}`;
    const users = [
      { name: "Quest owner", telegramId: (7_000_000_000_000_000_000n).toString() },
      { name: "Accepted friend", telegramId: (7_000_000_000_000_000_001n).toString() },
      { name: "Active partner", telegramId: (7_000_000_000_000_000_002n).toString() },
      { name: "Unrelated profile", telegramId: (7_000_000_000_000_000_003n).toString() },
    ];
    const tokens = users.map(() => `telegram_${randomBytes(32).toString("base64url")}`);
    const tokenHashes = tokens.map((token) =>
      createHash("sha256").update(token).digest("hex"),
    );
    let serverProcess;
    let output = "";

    try {
      await pool.query(`CREATE SCHEMA "${schema}"`);
      const client = await pool.connect();
      let userIds;
      let experienceId;
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
          CREATE TABLE organisations (id serial PRIMARY KEY);
          CREATE TABLE experiences (
            id serial PRIMARY KEY,
            organisation_id integer NOT NULL REFERENCES organisations(id),
            title text NOT NULL,
            description text NOT NULL,
            category text NOT NULL,
            date text NOT NULL,
            start_time text NOT NULL,
            end_time text NOT NULL,
            location text NOT NULL,
            city text NOT NULL,
            capacity integer NOT NULL,
            xp_reward integer NOT NULL,
            monetary_reward_pence integer,
            what_to_bring text,
            what_you_will_do text,
            status text NOT NULL DEFAULT 'published',
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE participations (
            id serial PRIMARY KEY,
            experience_id integer NOT NULL REFERENCES experiences(id),
            user_id integer NOT NULL REFERENCES users(id),
            status text NOT NULL DEFAULT 'joined',
            joined_at timestamptz NOT NULL DEFAULT now(),
            attended_at timestamptz,
            submitted_at timestamptz,
            completion_statement text,
            evidence_object_keys jsonb NOT NULL DEFAULT '[]',
            submission_version integer NOT NULL DEFAULT 0,
            verified_at timestamptz,
            review_reason text,
            reviewed_by_user_id integer REFERENCES users(id),
            reviewed_at timestamptz,
            reward_status text NOT NULL DEFAULT 'pending',
            UNIQUE (experience_id, user_id)
          );
          CREATE TABLE friendships (
            id serial PRIMARY KEY,
            requester_user_id integer NOT NULL REFERENCES users(id),
            recipient_user_id integer NOT NULL REFERENCES users(id),
            status text NOT NULL DEFAULT 'pending',
            created_at timestamptz NOT NULL DEFAULT now(),
            accepted_at timestamptz,
            social_invite_id integer
          );
          CREATE TABLE accountability_partnerships (
            id serial PRIMARY KEY,
            requester_user_id integer NOT NULL REFERENCES users(id),
            recipient_user_id integer NOT NULL REFERENCES users(id),
            status text NOT NULL DEFAULT 'pending',
            created_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
            accepted_at timestamptz,
            ended_at timestamptz
          );
          CREATE TABLE community_contributions (
            id serial PRIMARY KEY,
            user_id integer NOT NULL REFERENCES users(id),
            admin_user_id integer REFERENCES users(id),
            chat_id text NOT NULL,
            telegram_message_id text NOT NULL,
            target_message_id text,
            contribution_type text NOT NULL,
            qualification_reason text NOT NULL,
            word_count integer NOT NULL DEFAULT 0,
            xp_awarded integer NOT NULL DEFAULT 0,
            message_hash text,
            created_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE (chat_id, telegram_message_id)
          );
        `);
        await client.query(
          await readFile(path.join(root, "lib/db/migrations/0040_shared_quests.sql"), "utf8"),
        );
        await client.query("INSERT INTO organisations DEFAULT VALUES");
        const experience = await client.query(
          `INSERT INTO experiences (
             organisation_id, title, description, category, date, start_time, end_time,
             location, city, capacity, xp_reward, status
           )
           VALUES (1, 'Neighbourhood garden day', 'A verified outdoor activity.', 'community',
                   '2026-12-01', '10:00', '12:00', 'Garden', 'London', 20, 10, 'published')
           RETURNING id`,
        );
        experienceId = experience.rows[0].id;
        const createdUsers = [];
        for (let index = 0; index < users.length; index += 1) {
          const created = await client.query(
            `INSERT INTO users (telegram_id, name, username, user_type)
             VALUES ($1, $2, $3, 'participant') RETURNING id`,
            [users[index].telegramId, users[index].name, `quest_${index}_${nonce}`],
          );
          createdUsers.push(created.rows[0].id);
        }
        userIds = createdUsers;
        await client.query(
          `INSERT INTO telegram_sessions (user_id, token_hash, expires_at)
           SELECT id, hash, now() + interval '30 minutes'
           FROM unnest($1::integer[], $2::text[]) AS sessions(id, hash)`,
          [userIds, tokenHashes],
        );
        await client.query(
          `INSERT INTO friendships (requester_user_id, recipient_user_id, status)
           VALUES ($1, $2, 'accepted')`,
          [userIds[0], userIds[1]],
        );
        await client.query(
          `INSERT INTO accountability_partnerships (
             requester_user_id, recipient_user_id, status, accepted_at
           ) VALUES ($1, $2, 'active', now())`,
          [userIds[0], userIds[2]],
        );
        await client.query(
          `INSERT INTO community_contributions (
             user_id, chat_id, telegram_message_id, contribution_type,
             qualification_reason, word_count, xp_awarded
           )
           VALUES ($1, $3, 'before-owner', 'telegram_message', 'qualified', 8, 1),
                  ($2, $3, 'before-friend', 'telegram_message', 'qualified', 9, 1)`,
          [userIds[0], userIds[1], chatId],
        );
      } finally {
        client.release();
      }

      const build = spawnSync(process.execPath, ["./build.mjs"], {
        cwd: packageRoot,
        encoding: "utf8",
      });
      assert.equal(build.status, 0, `API server build failed.\n${build.stderr}`);
      const port = await findAvailablePort();
      serverProcess = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
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
      });
      serverProcess.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
      serverProcess.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(serverProcess, baseUrl, () => output);

      const socialCreate = await request(baseUrl, "/api/quests/social", tokens[0], {
        method: "POST",
        body: {
          title: "Garden day together",
          experienceId,
          participantIds: [userIds[1], userIds[2]],
          targetCount: 2,
        },
      });
      assert.equal(socialCreate.status, 201, JSON.stringify(socialCreate.body));
      const socialQuestId = socialCreate.body.id;
      assert.equal(socialCreate.body.progress, 0);
      assert.equal(socialCreate.body.participants.length, 3);

      const forbiddenSocial = await request(baseUrl, "/api/quests/social", tokens[0], {
        method: "POST",
        body: {
          title: "Unrelated invitation",
          experienceId,
          participantIds: [userIds[3]],
          targetCount: 2,
        },
      });
      assert.equal(forbiddenSocial.status, 409);
      assert.deepEqual(
        (await request(baseUrl, "/api/quests/social", tokens[3])).body,
        [],
      );

      const inviteNotifications = await request(baseUrl, "/api/quests/notifications", tokens[1]);
      assert.equal(inviteNotifications.status, 200);
      const invitation = inviteNotifications.body.find(
        ({ questId, type }) => questId === socialQuestId && type === "invitation",
      );
      assert.ok(invitation, "The invitee receives a stored invitation notification.");
      assert.equal(
        (await request(baseUrl, `/api/quests/notifications/${invitation.id}/read`, tokens[3], {
          method: "PATCH",
        })).status,
        404,
        "A different profile cannot mark the invitee's notification read.",
      );

      const accepts = await Promise.all([
        request(baseUrl, `/api/quests/social/${socialQuestId}/accept`, tokens[1], { method: "POST" }),
        request(baseUrl, `/api/quests/social/${socialQuestId}/accept`, tokens[1], { method: "POST" }),
      ]);
      assert.deepEqual(accepts.map(({ status }) => status).sort(), [200, 409]);
      await pool.query(
        `INSERT INTO "${schema}".participations (experience_id, user_id, status)
         VALUES ($1, $2, 'joined'), ($1, $3, 'joined')`,
        [experienceId, userIds[0], userIds[1]],
      );
      const beforeVerification = await request(baseUrl, "/api/quests/social", tokens[0]);
      assert.equal(beforeVerification.body[0].progress, 0, "Joined or self-reported attendance does not count.");
      await pool.query(
        `UPDATE "${schema}".participations SET status = 'verified', verified_at = now()
         WHERE experience_id = $1 AND user_id = ANY($2::integer[])`,
        [experienceId, [userIds[0], userIds[1]]],
      );
      const concurrentSocialReads = await Promise.all([
        request(baseUrl, "/api/quests/social", tokens[0]),
        request(baseUrl, "/api/quests/social", tokens[1]),
        request(baseUrl, "/api/quests/social", tokens[0]),
      ]);
      assert.ok(concurrentSocialReads.every(({ status }) => status === 200));
      assert.ok(concurrentSocialReads.every(({ body }) => body[0].status === "completed"));
      const socialParticipants = await pool.query(
        `SELECT user_id, status, reward_granted_at
         FROM "${schema}".shared_quest_participants WHERE quest_id = $1`,
        [socialQuestId],
      );
      assert.equal(
        socialParticipants.rows.filter((row) => row.reward_granted_at !== null).length,
        2,
        "Only the two verified participants receive one recognition grant each.",
      );
      assert.equal(
        socialParticipants.rows.find((row) => row.user_id === userIds[2]).status,
        "invited",
        "The active partner remains pending because they have not accepted.",
      );
      const socialNotificationCount = await pool.query(
        `SELECT count(*)::integer AS total
         FROM "${schema}".shared_quest_notifications WHERE quest_id = $1`,
        [socialQuestId],
      );
      await request(baseUrl, "/api/quests/social", tokens[0]);
      assert.equal(
        Number((await pool.query(
          `SELECT count(*)::integer AS total FROM "${schema}".shared_quest_notifications WHERE quest_id = $1`,
          [socialQuestId],
        )).rows[0].total),
        Number(socialNotificationCount.rows[0].total),
        "Repeated reconciliation does not create duplicate notifications.",
      );

      const mission = await request(baseUrl, "/api/quests/community", tokens[0], {
        method: "POST",
        body: { title: "Garden group mission", chatId, targetCount: 2 },
      });
      assert.equal(mission.status, 201, JSON.stringify(mission.body));
      const communityQuestId = mission.body.id;
      assert.equal(mission.body.progress, 0, "Only post-creation contribution records count.");
      assert.equal(
        (await request(baseUrl, `/api/quests/community/${communityQuestId}/join`, tokens[3], {
          method: "POST",
        })).status,
        403,
        "A profile without a qualifying contribution cannot join.",
      );
      const duplicateJoins = await Promise.all([
        request(baseUrl, `/api/quests/community/${communityQuestId}/join`, tokens[1], { method: "POST" }),
        request(baseUrl, `/api/quests/community/${communityQuestId}/join`, tokens[1], { method: "POST" }),
      ]);
      assert.ok(duplicateJoins.every(({ status }) => status === 200));
      await pool.query(
        `INSERT INTO "${schema}".community_contributions (
           user_id, chat_id, telegram_message_id, contribution_type,
           qualification_reason, word_count, xp_awarded
         )
         VALUES ($1, $3, 'after-owner', 'telegram_message', 'qualified', 8, 1),
                ($2, $3, 'after-friend', 'telegram_message', 'qualified', 10, 1)`,
        [userIds[0], userIds[1], chatId],
      );
      const unqualified = await pool.query(
        `INSERT INTO "${schema}".community_contributions (
           user_id, chat_id, telegram_message_id, contribution_type,
           qualification_reason, word_count, xp_awarded
         )
         VALUES ($1, $2, 'capped-message', 'telegram_message', 'member_lifetime_cap', 12, 0)`,
        [userIds[0], chatId],
      );
      assert.equal(unqualified.rowCount, 1);
      const concurrentMissionReads = await Promise.all([
        request(baseUrl, "/api/quests/community", tokens[0]),
        request(baseUrl, "/api/quests/community", tokens[1]),
        request(baseUrl, "/api/quests/community", tokens[0]),
      ]);
      assert.ok(concurrentMissionReads.every(({ status }) => status === 200));
      const finalMission = concurrentMissionReads
        .flatMap(({ body }) => body)
        .find(({ id }) => id === communityQuestId);
      assert.equal(finalMission.status, "completed");
      assert.equal(finalMission.progress, 2, "Capped messages do not count.");
      assert.equal(
        finalMission.participants.filter((participant) => participant.rewardGrantedAt).length,
        2,
      );
      const communityRewardCount = await pool.query(
        `SELECT count(*)::integer AS total
         FROM "${schema}".shared_quest_notifications
         WHERE quest_id = $1 AND type = 'reward_granted'`,
        [communityQuestId],
      );
      assert.equal(Number(communityRewardCount.rows[0].total), 2);
      const balances = await pool.query(
        `SELECT id, xp FROM "${schema}".users WHERE id = ANY($1::integer[])`,
        [[userIds[0], userIds[1]]],
      );
      assert.ok(balances.rows.every((row) => row.xp === 0), "Mission recognition does not award Experience XP.");
      await Promise.all([
        request(baseUrl, "/api/quests/community", tokens[0]),
        request(baseUrl, "/api/quests/community", tokens[1]),
      ]);
      assert.equal(
        Number((await pool.query(
          `SELECT count(*)::integer AS total
           FROM "${schema}".shared_quest_notifications
           WHERE quest_id = $1 AND type = 'reward_granted'`,
          [communityQuestId],
        )).rows[0].total),
        2,
        "Repeated reconciliation does not duplicate community recognition.",
      );
    } finally {
      if (serverProcess) {
        await stopServer(serverProcess);
        await delay(50);
      }
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
      await pool.end();
    }
  },
);
