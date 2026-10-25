BEGIN;

CREATE TABLE "organisation_fund_outcome_reports" (
  "id" serial PRIMARY KEY,
  "milestone_id" integer NOT NULL REFERENCES "organisation_fund_milestones"("id") ON DELETE RESTRICT,
  "reported_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "milestone_title" text NOT NULL,
  "planned_outcome" text NOT NULL,
  "status" text NOT NULL,
  "update_text" text NOT NULL,
  "evidence_url" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "organisation_fund_outcome_reports_status_check" CHECK ("status" IN ('in_progress', 'completed', 'blocked')),
  CONSTRAINT "organisation_fund_outcome_reports_title_length_check" CHECK (char_length("milestone_title") BETWEEN 3 AND 80),
  CONSTRAINT "organisation_fund_outcome_reports_planned_outcome_length_check" CHECK (char_length("planned_outcome") BETWEEN 10 AND 300),
  CONSTRAINT "organisation_fund_outcome_reports_update_length_check" CHECK (char_length("update_text") BETWEEN 10 AND 600),
  CONSTRAINT "organisation_fund_outcome_reports_evidence_url_check" CHECK ("evidence_url" IS NULL OR (char_length("evidence_url") <= 2048 AND "evidence_url" ~* '^https://'))
);

CREATE INDEX "organisation_fund_outcome_reports_milestone_created_idx"
  ON "organisation_fund_outcome_reports" ("milestone_id", "created_at", "id");

COMMIT;
