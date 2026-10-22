BEGIN;

CREATE TABLE "telegram_communities" (
  "id" serial PRIMARY KEY,
  "chat_id" text NOT NULL,
  "chat_title" text NOT NULL,
  "organisation_id" integer NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "connected_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "spam_protection_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "telegram_communities_chat_id_idx"
  ON "telegram_communities" ("chat_id");
CREATE INDEX "telegram_communities_organisation_idx"
  ON "telegram_communities" ("organisation_id");

CREATE TABLE "telegram_community_keyword_rules" (
  "id" serial PRIMARY KEY,
  "community_id" integer NOT NULL REFERENCES "telegram_communities"("id") ON DELETE CASCADE,
  "phrase" text NOT NULL,
  "normalized_phrase" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "telegram_community_keyword_rules_phrase_idx"
  ON "telegram_community_keyword_rules" ("community_id", "normalized_phrase");
CREATE INDEX "telegram_community_keyword_rules_enabled_idx"
  ON "telegram_community_keyword_rules" ("community_id", "enabled");

COMMIT;
