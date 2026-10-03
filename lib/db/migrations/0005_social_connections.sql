-- Add ordered pinned friends and a separate organisation-to-organisation relationship.
-- Apply only after confirming the target database environment.
BEGIN;

CREATE TABLE "pinned_friends" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "friend_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "pinned_friends_different_users_check"
    CHECK ("user_id" <> "friend_user_id"),
  CONSTRAINT "pinned_friends_position_range_check"
    CHECK ("position" >= 0 AND "position" <= 2)
);

CREATE UNIQUE INDEX "pinned_friends_user_friend_idx"
  ON "pinned_friends" ("user_id", "friend_user_id");
CREATE UNIQUE INDEX "pinned_friends_user_position_idx"
  ON "pinned_friends" ("user_id", "position");

CREATE TABLE "organisation_partnerships" (
  "id" SERIAL PRIMARY KEY,
  "requester_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending', 'active', 'declined', 'ended')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "accepted_at" TIMESTAMPTZ,
  "ended_at" TIMESTAMPTZ,
  CONSTRAINT "organisation_partnership_different_users_check"
    CHECK ("requester_user_id" <> "recipient_user_id")
);

CREATE UNIQUE INDEX "organisation_partnership_pair_idx"
  ON "organisation_partnerships" (
    LEAST("requester_user_id", "recipient_user_id"),
    GREATEST("requester_user_id", "recipient_user_id")
  );
CREATE INDEX "organisation_partnership_requester_status_idx"
  ON "organisation_partnerships" ("requester_user_id", "status");
CREATE INDEX "organisation_partnership_recipient_status_idx"
  ON "organisation_partnerships" ("recipient_user_id", "status");

COMMIT;