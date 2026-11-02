CREATE TABLE nodes (
  id serial PRIMARY KEY,
  organisation_id integer NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  categories text[] NOT NULL DEFAULT '{}',
  address_line1 text,
  address_line2 text,
  city text,
  country text,
  postcode text,
  latitude double precision,
  longitude double precision,
  public_website text,
  public_contact_email text,
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted')),
  approval_required boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'draft'
    CHECK (verification_status IN ('draft', 'pending', 'under_review', 'needs_information', 'verified', 'rejected', 'suspended')),
  reviewer_notes text,
  submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nodes_coordinates_pair_check CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);

CREATE INDEX nodes_organisation_idx ON nodes(organisation_id);
CREATE INDEX nodes_discovery_idx ON nodes(verification_status, visibility, city);
CREATE UNIQUE INDEX nodes_slug_idx ON nodes(slug);
CREATE UNIQUE INDEX nodes_organisation_name_idx ON nodes(organisation_id, name);

CREATE TABLE node_memberships (
  id serial PRIMARY KEY,
  node_id integer NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participation_role text NOT NULL
    CHECK (participation_role IN ('participant', 'volunteer', 'learner')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active')),
  is_primary boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
);

CREATE UNIQUE INDEX node_memberships_node_user_idx ON node_memberships(node_id, user_id);
CREATE INDEX node_memberships_user_idx ON node_memberships(user_id, status);
CREATE INDEX node_memberships_node_status_idx ON node_memberships(node_id, status);
CREATE UNIQUE INDEX node_memberships_one_primary_per_user_idx
  ON node_memberships(user_id)
  WHERE is_primary = true AND status = 'active';

CREATE TABLE node_verification_events (
  id serial PRIMARY KEY,
  node_id integer NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('draft', 'pending', 'under_review', 'needs_information', 'verified', 'rejected', 'suspended')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX node_verification_events_node_created_idx
  ON node_verification_events(node_id, created_at);

CREATE TABLE node_experiences (
  node_id integer NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  experience_id integer NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT node_experiences_pkey PRIMARY KEY (node_id, experience_id)
);

CREATE UNIQUE INDEX node_experiences_experience_unique ON node_experiences(experience_id);
