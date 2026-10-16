BEGIN;

ALTER TABLE "organisation_funds"
  ADD COLUMN "experience_id" integer REFERENCES "experiences"("id") ON DELETE SET NULL;

CREATE INDEX "organisation_funds_experience_idx"
  ON "organisation_funds" ("experience_id")
  WHERE "experience_id" IS NOT NULL;

COMMIT;
