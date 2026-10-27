BEGIN;

ALTER TABLE "telegram_communities"
  ADD COLUMN "riddles_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "riddle_interval_minutes" integer NOT NULL DEFAULT 60,
  ADD COLUMN "next_riddle_at" timestamptz,
  ADD COLUMN "active_riddle_message_id" integer,
  ADD COLUMN "active_riddle_id" text,
  ADD COLUMN "active_riddle_expires_at" timestamptz;

ALTER TABLE "telegram_communities"
  ADD CONSTRAINT "telegram_communities_riddle_interval_check"
  CHECK ("riddle_interval_minutes" IN (30, 60, 180, 360, 720, 1440)),
  ADD CONSTRAINT "telegram_communities_active_riddle_check"
  CHECK (
    (
      "active_riddle_message_id" IS NULL
      AND "active_riddle_id" IS NULL
      AND "active_riddle_expires_at" IS NULL
    )
    OR
    (
      "active_riddle_message_id" IS NOT NULL
      AND "active_riddle_id" IS NOT NULL
      AND "active_riddle_expires_at" IS NOT NULL
    )
  );

CREATE INDEX "telegram_communities_riddles_due_idx"
  ON "telegram_communities" ("riddles_enabled", "next_riddle_at");

COMMIT;
