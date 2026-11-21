BEGIN;

ALTER TABLE "telegram_communities"
  ADD COLUMN "welcome_message" text NOT NULL DEFAULT '',
  ADD COLUMN "welcome_buttons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT "telegram_communities_welcome_message_length_check"
    CHECK (char_length("welcome_message") <= 3500),
  ADD CONSTRAINT "telegram_communities_welcome_buttons_check"
    CHECK (
      CASE
        WHEN jsonb_typeof("welcome_buttons") = 'array'
        THEN jsonb_array_length("welcome_buttons") <= 6
        ELSE false
      END
    ),
  ADD CONSTRAINT "telegram_communities_welcome_requires_message_check"
    CHECK (
      CASE
        WHEN jsonb_typeof("welcome_buttons") = 'array'
        THEN char_length(btrim("welcome_message")) > 0
          OR jsonb_array_length("welcome_buttons") = 0
        ELSE false
      END
    );

COMMIT;
