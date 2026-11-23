BEGIN;

CREATE TABLE "telegram_community_custom_commands" (
  "id" serial PRIMARY KEY,
  "chat_id" text NOT NULL
    REFERENCES "telegram_communities" ("chat_id") ON DELETE CASCADE,
  "command" text NOT NULL,
  "response" text NOT NULL,
  "created_by_user_id" integer NOT NULL
    REFERENCES "users" ("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "telegram_community_custom_commands_command_format_check"
    CHECK ("command" ~ '^[a-z0-9_]{1,32}$'),
  CONSTRAINT "telegram_community_custom_commands_response_length_check"
    CHECK (char_length(btrim("response")) BETWEEN 1 AND 3500)
);

CREATE UNIQUE INDEX "telegram_community_custom_commands_chat_command_idx"
  ON "telegram_community_custom_commands" ("chat_id", "command");

COMMIT;
