BEGIN;

CREATE TABLE "telegram_community_link_rules" (
  "id" serial PRIMARY KEY,
  "community_id" integer NOT NULL REFERENCES "telegram_communities"("id") ON DELETE CASCADE,
  "link" text NOT NULL,
  "normalized_host" text NOT NULL,
  "normalized_path" text NOT NULL,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "telegram_community_link_rules_unique_idx"
  ON "telegram_community_link_rules" ("community_id", "normalized_host", "normalized_path");
CREATE INDEX "telegram_community_link_rules_host_idx"
  ON "telegram_community_link_rules" ("community_id", "normalized_host");

COMMIT;
