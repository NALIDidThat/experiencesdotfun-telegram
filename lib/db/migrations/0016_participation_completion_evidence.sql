ALTER TABLE participations
  ADD COLUMN completion_statement text,
  ADD COLUMN submission_version integer NOT NULL DEFAULT 0,
  ADD COLUMN review_reason text,
  ADD COLUMN reviewed_by_user_id integer REFERENCES users(id),
  ADD COLUMN reviewed_at timestamptz;

ALTER TABLE participations
  ADD CONSTRAINT participations_submission_version_check
  CHECK (submission_version >= 0),
  ADD CONSTRAINT participations_completion_statement_check
  CHECK (completion_statement IS NULL OR length(completion_statement) <= 1500),
  ADD CONSTRAINT participations_review_reason_check
  CHECK (review_reason IS NULL OR length(review_reason) <= 500);
