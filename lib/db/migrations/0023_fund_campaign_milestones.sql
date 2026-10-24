BEGIN;

CREATE TABLE "organisation_fund_milestones" (
  "id" serial PRIMARY KEY,
  "fund_id" integer NOT NULL REFERENCES "organisation_funds"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "title" text NOT NULL,
  "outcome" text NOT NULL,
  "target_sol" numeric(20, 9) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "organisation_fund_milestones_fund_position_unique" UNIQUE ("fund_id", "position"),
  CONSTRAINT "organisation_fund_milestones_position_check" CHECK ("position" > 0),
  CONSTRAINT "organisation_fund_milestones_title_length_check" CHECK (char_length("title") BETWEEN 3 AND 80),
  CONSTRAINT "organisation_fund_milestones_outcome_length_check" CHECK (char_length("outcome") BETWEEN 10 AND 300),
  CONSTRAINT "organisation_fund_milestones_target_check" CHECK ("target_sol" > 0 AND "target_sol" <= 1000000000)
);

COMMIT;
