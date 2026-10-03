-- Persistent profile-to-profile direct messages, independent of the friend graph.
BEGIN;

CREATE TABLE "direct_conversations" (
  "id" SERIAL PRIMARY KEY,
  "participant_a_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "participant_b_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_message_at" TIMESTAMPTZ,
  CONSTRAINT "direct_conversations_different_participants_check"
    CHECK ("participant_a_user_id" < "participant_b_user_id")
);

CREATE UNIQUE INDEX "direct_conversations_pair_idx"
  ON "direct_conversations" ("participant_a_user_id", "participant_b_user_id");
CREATE INDEX "direct_conversations_a_activity_idx"
  ON "direct_conversations" ("participant_a_user_id", "last_message_at");
CREATE INDEX "direct_conversations_b_activity_idx"
  ON "direct_conversations" ("participant_b_user_id", "last_message_at");

CREATE TABLE "direct_messages" (
  "id" SERIAL PRIMARY KEY,
  "conversation_id" INTEGER NOT NULL REFERENCES "direct_conversations"("id") ON DELETE CASCADE,
  "sender_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "read_at" TIMESTAMPTZ,
  CONSTRAINT "direct_messages_body_length_check"
    CHECK (char_length("body") BETWEEN 1 AND 2000 AND btrim("body") <> '')
);

CREATE INDEX "direct_messages_conversation_message_idx"
  ON "direct_messages" ("conversation_id", "id");
CREATE INDEX "direct_messages_unread_idx"
  ON "direct_messages" ("conversation_id", "sender_user_id", "read_at")
  WHERE "read_at" IS NULL;
CREATE INDEX "direct_messages_sender_created_idx"
  ON "direct_messages" ("sender_user_id", "created_at");

COMMIT;