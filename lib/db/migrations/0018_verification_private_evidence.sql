ALTER TABLE participations
  ADD COLUMN evidence_object_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE experience_milestone_submissions
  ADD COLUMN evidence_object_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN review_reason text,
  ADD COLUMN submission_version integer NOT NULL DEFAULT 1;

ALTER TABLE experience_milestone_submissions
  ADD CONSTRAINT experience_milestone_review_reason_check
  CHECK (review_reason IS NULL OR length(review_reason) <= 500),
  ADD CONSTRAINT experience_milestone_submission_version_check
  CHECK (submission_version >= 1);

CREATE TABLE experience_milestone_review_events (
  id serial PRIMARY KEY,
  submission_id integer NOT NULL REFERENCES experience_milestone_submissions(id) ON DELETE CASCADE,
  reviewer_user_id integer NOT NULL REFERENCES users(id),
  submission_version integer NOT NULL CHECK (submission_version >= 1),
  decision text NOT NULL CHECK (decision IN ('verified', 'rejected')),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX experience_milestone_review_events_submission_idx
  ON experience_milestone_review_events(submission_id, created_at);
