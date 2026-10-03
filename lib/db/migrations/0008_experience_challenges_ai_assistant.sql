-- Add friend challenges and profile-owned AI conversation history.
-- Apply only to the explicitly confirmed Supabase target; do not use broad drizzle-kit push.
BEGIN;

CREATE TABLE "experience_challenges" (
  "id" SERIAL PRIMARY KEY,
  "experience_id" INTEGER NOT NULL REFERENCES "experiences"("id") ON DELETE CASCADE,
  "challenger_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "challenged_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "accepted_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  CONSTRAINT "experience_challenges_different_participants_check"
    CHECK ("challenger_user_id" <> "challenged_user_id"),
  CONSTRAINT "experience_challenges_status_check"
    CHECK ("status" IN ('pending', 'accepted', 'declined', 'completed'))
);

CREATE INDEX "experience_challenges_challenger_activity_idx"
  ON "experience_challenges" ("challenger_user_id", "created_at");
CREATE INDEX "experience_challenges_challenged_activity_idx"
  ON "experience_challenges" ("challenged_user_id", "created_at");
CREATE UNIQUE INDEX "experience_challenges_active_pair_idx"
  ON "experience_challenges" (
    "experience_id",
    LEAST("challenger_user_id", "challenged_user_id"),
    GREATEST("challenger_user_id", "challenged_user_id")
  )
  WHERE "status" IN ('pending', 'accepted');

CREATE TABLE "ai_conversations" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "ai_conversations_owner_activity_idx"
  ON "ai_conversations" ("user_id", "updated_at");

CREATE TABLE "ai_assistant_messages" (
  "id" SERIAL PRIMARY KEY,
  "conversation_id" INTEGER NOT NULL
    REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "actions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_assistant_messages_role_check"
    CHECK ("role" IN ('user', 'assistant'))
);
CREATE INDEX "ai_assistant_messages_history_idx"
  ON "ai_assistant_messages" ("conversation_id", "id");

-- Record the new mobile screens using the existing screen-view analytics event.
ALTER TABLE "analytics_events"
  DROP CONSTRAINT IF EXISTS "analytics_events_category_check";
ALTER TABLE "analytics_events"
  ADD CONSTRAINT "analytics_events_category_check"
  CHECK (
    "category" IN (
      'home',
      'explore',
      'experiences',
      'ai',
      'challenges',
      'profile',
      'notifications',
      'messages',
      'direct-message',
      'friends',
      'friend-profile',
      'experience',
      'host',
      'create',
      'email',
      'telegram',
      'start',
      'menu',
      'onboarding',
      'help',
      'xp',
      'progress',
      'rank',
      'leaderboard',
      'requests',
      'add',
      'accountability',
      'friendship',
      'community',
      'other'
    )
  );

COMMIT;