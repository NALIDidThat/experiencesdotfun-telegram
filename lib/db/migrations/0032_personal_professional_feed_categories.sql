BEGIN;

ALTER TABLE "posts"
  ADD COLUMN "category" text NOT NULL DEFAULT 'personal',
  ADD COLUMN "topic" text NOT NULL DEFAULT 'general';

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_category_check"
    CHECK ("category" IN ('personal', 'professional')),
  ADD CONSTRAINT "posts_topic_category_check"
    CHECK (
      ("category" = 'personal' AND "topic" IN ('general', 'goals', 'reflections', 'experiences', 'community'))
      OR
      ("category" = 'professional' AND "topic" IN ('general', 'career', 'skills', 'learning', 'networking', 'projects'))
    );

CREATE INDEX "posts_category_topic_created_idx"
  ON "posts" ("category", "topic", "created_at", "id");

COMMIT;
