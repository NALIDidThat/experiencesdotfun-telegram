BEGIN;

CREATE TABLE "journey_programmes" (
  "id" SERIAL PRIMARY KEY,
  "organisation_id" INTEGER NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "journey_programmes_title_length_check"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  CONSTRAINT "journey_programmes_description_length_check"
    CHECK (char_length(btrim("description")) BETWEEN 1 AND 1000),
  CONSTRAINT "journey_programmes_status_check"
    CHECK ("status" IN ('draft', 'published', 'archived'))
);
CREATE INDEX "journey_programmes_org_status_idx"
  ON "journey_programmes" ("organisation_id", "status", "created_at");

CREATE TABLE "journey_programme_steps" (
  "id" SERIAL PRIMARY KEY,
  "programme_id" INTEGER NOT NULL REFERENCES "journey_programmes"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "experience_id" INTEGER REFERENCES "experiences"("id") ON DELETE RESTRICT,
  "milestone_id" INTEGER REFERENCES "experience_milestones"("id") ON DELETE RESTRICT,
  "resource_url" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "journey_programme_step_position_check"
    CHECK ("position" BETWEEN 1 AND 20),
  CONSTRAINT "journey_programme_step_title_length_check"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  CONSTRAINT "journey_programme_step_description_length_check"
    CHECK ("description" IS NULL OR char_length("description") <= 500),
  CONSTRAINT "journey_programme_step_kind_reference_check"
    CHECK (
      ("kind" = 'experience' AND "experience_id" IS NOT NULL AND "milestone_id" IS NULL AND "resource_url" IS NULL)
      OR ("kind" = 'milestone' AND "experience_id" IS NOT NULL AND "milestone_id" IS NOT NULL AND "resource_url" IS NULL)
      OR ("kind" = 'resource' AND "experience_id" IS NULL AND "milestone_id" IS NULL AND "resource_url" IS NOT NULL)
    )
);
CREATE UNIQUE INDEX "journey_programme_step_position_idx"
  ON "journey_programme_steps" ("programme_id", "position");
CREATE INDEX "journey_programme_step_programme_idx"
  ON "journey_programme_steps" ("programme_id");

CREATE TABLE "journey_enrolments" (
  "id" SERIAL PRIMARY KEY,
  "programme_id" INTEGER NOT NULL REFERENCES "journey_programmes"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  "withdrawn_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "journey_enrolment_status_check"
    CHECK ("status" IN ('active', 'completed', 'withdrawn')),
  CONSTRAINT "journey_enrolment_completion_state_check"
    CHECK (
      ("status" = 'completed' AND "completed_at" IS NOT NULL)
      OR ("status" <> 'completed' AND "completed_at" IS NULL)
    )
);
CREATE UNIQUE INDEX "journey_enrolment_programme_user_idx"
  ON "journey_enrolments" ("programme_id", "user_id");
CREATE INDEX "journey_enrolment_user_status_idx"
  ON "journey_enrolments" ("user_id", "status", "updated_at");
CREATE INDEX "journey_enrolment_programme_status_idx"
  ON "journey_enrolments" ("programme_id", "status", "updated_at");

CREATE TABLE "journey_events" (
  "id" SERIAL PRIMARY KEY,
  "enrolment_id" INTEGER NOT NULL REFERENCES "journey_enrolments"("id") ON DELETE CASCADE,
  "actor_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "step_id" INTEGER REFERENCES "journey_programme_steps"("id") ON DELETE SET NULL,
  "event_type" TEXT NOT NULL,
  "source_record_id" INTEGER,
  "dedupe_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "journey_events_type_check"
    CHECK ("event_type" IN ('enrolled', 'withdrawn', 'step_completed', 'completed'))
);
CREATE UNIQUE INDEX "journey_events_dedupe_idx" ON "journey_events" ("dedupe_key");
CREATE INDEX "journey_events_enrolment_created_idx"
  ON "journey_events" ("enrolment_id", "created_at");

COMMIT;
