CREATE TABLE participation_review_events (
  id serial PRIMARY KEY,
  participation_id integer NOT NULL REFERENCES participations(id) ON DELETE CASCADE,
  reviewer_user_id integer NOT NULL REFERENCES users(id),
  submission_version integer NOT NULL CHECK (submission_version >= 1),
  decision text NOT NULL CHECK (decision IN ('verified', 'rejected')),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX participation_review_events_participation_idx
  ON participation_review_events(participation_id, created_at);
