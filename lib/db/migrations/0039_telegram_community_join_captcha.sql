BEGIN;

ALTER TABLE "telegram_communities"
  ADD COLUMN "join_captcha_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "join_captcha_button_text" text NOT NULL DEFAULT 'Verify I''m human',
  ADD CONSTRAINT "telegram_communities_join_captcha_button_text_check"
    CHECK (char_length(btrim("join_captcha_button_text")) BETWEEN 1 AND 64);

COMMIT;
