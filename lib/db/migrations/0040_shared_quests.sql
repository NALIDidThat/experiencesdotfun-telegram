-- Shared objectives reuse verified experience participation and the Telegram
-- contribution ledger. Recognition is recorded separately and does not award XP.
BEGIN;

CREATE TABLE "shared_quests" (
  "id" SERIAL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "owner_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "experience_id" INTEGER REFERENCES "experiences"("id") ON DELETE CASCADE,
  "chat_id" TEXT,
  "title" TEXT NOT NULL,
  "target_count" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  CONSTRAINT "shared_quest_title_length_check"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 100),
  CONSTRAINT "shared_quest_target_count_check"
    CHECK ("target_count" BETWEEN 1 AND 500),
  CONSTRAINT "shared_quest_status_check"
    CHECK ("status" IN ('active', 'completed', 'cancelled')),
  CONSTRAINT "shared_quest_scope_check"
    CHECK (
      ("kind" = 'social' AND "experience_id" IS NOT NULL AND "chat_id" IS NULL)
      OR ("kind" = 'community' AND "experience_id" IS NULL AND "chat_id" IS NOT NULL)
    )
);

CREATE INDEX "shared_quest_owner_activity_idx"
  ON "shared_quests" ("owner_user_id", "created_at");
CREATE INDEX "shared_quest_community_activity_idx"
  ON "shared_quests" ("chat_id", "status", "created_at");

CREATE TABLE "shared_quest_participants" (
  "id" SERIAL PRIMARY KEY,
  "quest_id" INTEGER NOT NULL REFERENCES "shared_quests"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'invited',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "accepted_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "reward_granted_at" TIMESTAMPTZ,
  CONSTRAINT "shared_quest_participant_status_check"
    CHECK ("status" IN ('invited', 'active', 'declined', 'completed'))
);
CREATE UNIQUE INDEX "shared_quest_participant_quest_user_idx"
  ON "shared_quest_participants" ("quest_id", "user_id");
CREATE INDEX "shared_quest_participant_user_activity_idx"
  ON "shared_quest_participants" ("user_id", "created_at");

CREATE TABLE "shared_quest_notifications" (
  "id" SERIAL PRIMARY KEY,
  "quest_id" INTEGER NOT NULL REFERENCES "shared_quests"("id") ON DELETE CASCADE,
  "recipient_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "shared_quest_notification_type_check"
    CHECK ("type" IN ('invitation', 'participant_completed', 'quest_completed', 'reward_granted'))
);
CREATE UNIQUE INDEX "shared_quest_notification_event_idx"
  ON "shared_quest_notifications" ("quest_id", "recipient_user_id", "actor_user_id", "type");
CREATE INDEX "shared_quest_notification_recipient_activity_idx"
  ON "shared_quest_notifications" ("recipient_user_id", "created_at");
CREATE INDEX "shared_quest_notification_recipient_unread_idx"
  ON "shared_quest_notifications" ("recipient_user_id", "read_at");

COMMIT;
