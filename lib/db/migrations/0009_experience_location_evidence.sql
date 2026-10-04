-- Store only evidence-backed, consented experience locations.
-- Public coordinates are derived by the API only after reviewStatus is verified.
BEGIN;

CREATE TABLE "experience_location_evidence" (
  "id" SERIAL PRIMARY KEY,
  "experience_id" INTEGER NOT NULL
    REFERENCES "experiences"("id") ON DELETE CASCADE,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "precision" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "consented_at" TIMESTAMPTZ NOT NULL,
  "consented_by_user_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "review_status" TEXT NOT NULL DEFAULT 'pending',
  "verified_at" TIMESTAMPTZ,
  "verified_by_user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "experience_location_evidence_latitude_check"
    CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "experience_location_evidence_longitude_check"
    CHECK ("longitude" BETWEEN -180 AND 180),
  CONSTRAINT "experience_location_evidence_precision_check"
    CHECK ("precision" IN ('city', 'neighborhood', 'venue_area')),
  CONSTRAINT "experience_location_evidence_source_type_check"
    CHECK ("source_type" IN ('organisation_site', 'venue_site', 'public_partner_event')),
  CONSTRAINT "experience_location_evidence_review_status_check"
    CHECK ("review_status" IN ('pending', 'verified', 'rejected')),
  CONSTRAINT "experience_location_evidence_source_url_check"
    CHECK ("source_url" ~ '^https://'),
  CONSTRAINT "experience_location_evidence_verification_check"
    CHECK (
      (
        "review_status" = 'verified'
        AND "verified_at" IS NOT NULL
        AND "verified_by_user_id" IS NOT NULL
      )
      OR (
        "review_status" <> 'verified'
        AND "verified_at" IS NULL
        AND "verified_by_user_id" IS NULL
      )
    )
);

CREATE UNIQUE INDEX "experience_location_evidence_experience_idx"
  ON "experience_location_evidence" ("experience_id");
CREATE INDEX "experience_location_evidence_review_idx"
  ON "experience_location_evidence" ("review_status", "created_at");

COMMIT;