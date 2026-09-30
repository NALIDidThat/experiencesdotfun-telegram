-- Additive schema for shareable social invitations.
-- Apply only to the confirmed external PostgreSQL target; do not use broad drizzle-kit push.
BEGIN;

CREATE TABLE IF NOT EXISTS "social_invites" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "inviter_user_id" integer NOT NULL REFERENCES "users"("id"),
  "target_username" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('friend', 'accountability')),
  "expires_at" timestamptz NOT NULL,
  "claimed_at" timestamptz,
  "claimed_user_id" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_invites_token_hash_idx" ON "social_invites" ("token_hash");
CREATE INDEX IF NOT EXISTS "social_invites_target_username_idx" ON "social_invites" ("target_username");
ALTER TABLE "friendships" ADD COLUMN IF NOT EXISTS "social_invite_id" integer;

COMMIT;