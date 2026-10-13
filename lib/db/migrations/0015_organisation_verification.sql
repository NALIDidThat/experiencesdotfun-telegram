ALTER TABLE organisations
  ADD COLUMN legacy_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN verification_status text NOT NULL DEFAULT 'unsubmitted',
  ADD COLUMN verification_submitted_at timestamptz,
  ADD COLUMN verification_reviewed_at timestamptz;

-- Legacy `verified` values are retained for review and audit; they are not
-- treated as newly verified. The old flag is preserved separately, while the
-- canonical flag now agrees with the new status.
UPDATE organisations
SET legacy_verified = verified,
    verified = false,
    verification_status = CASE WHEN verified THEN 'under_review' ELSE 'unsubmitted' END;

ALTER TABLE organisations
  ADD CONSTRAINT organisations_verification_status_check
  CHECK (verification_status IN ('unsubmitted', 'pending', 'under_review', 'verified', 'rejected', 'suspended', 'expired'));

CREATE TABLE organisation_verification_applications (
  id serial PRIMARY KEY,
  organisation_id integer NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  applicant_user_id integer NOT NULL REFERENCES users(id),
  legal_name text NOT NULL,
  organisation_type text NOT NULL,
  jurisdiction text NOT NULL,
  registration_number text,
  website text,
  representative_name text NOT NULL,
  representative_role text NOT NULL,
  contact_email text NOT NULL,
  evidence_object_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'under_review', 'needs_information', 'verified', 'rejected', 'suspended', 'expired')),
  reviewer_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organisation_verification_applications_organisation_idx
  ON organisation_verification_applications(organisation_id);
CREATE INDEX organisation_verification_applications_applicant_idx
  ON organisation_verification_applications(applicant_user_id);

CREATE TABLE organisation_verification_events (
  id serial PRIMARY KEY,
  organisation_id integer NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  application_id integer REFERENCES organisation_verification_applications(id) ON DELETE SET NULL,
  actor_user_id integer REFERENCES users(id),
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organisation_verification_events_organisation_idx
  ON organisation_verification_events(organisation_id);
CREATE INDEX organisation_verification_events_application_idx
  ON organisation_verification_events(application_id);
