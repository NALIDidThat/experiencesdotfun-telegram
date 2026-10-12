BEGIN;

ALTER TABLE "organisations"
  ADD COLUMN "organisation_type" text;

ALTER TABLE "organisations"
  ADD CONSTRAINT "organisations_organisation_type_check"
  CHECK (
    "organisation_type" IS NULL
    OR "organisation_type" IN (
      'charity',
      'nonprofit',
      'school',
      'community_centre',
      'library',
      'youth_organisation',
      'business',
      'other'
    )
  );

COMMIT;
