BEGIN;

CREATE TABLE "personal_activities" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "goal" text NOT NULL,
  "activity_type" text NOT NULL,
  "destination" text NOT NULL,
  "plan_summary" text NOT NULL,
  "plan_tips" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "route_polyline" text NOT NULL,
  "planned_distance_meters" integer NOT NULL,
  "planned_duration_seconds" integer,
  "planned_ascent_meters" integer,
  "elevation_profile" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'planned',
  "started_at" timestamptz,
  "paused_at" timestamptz,
  "paused_seconds" integer NOT NULL DEFAULT 0,
  "ended_at" timestamptz,
  "elapsed_seconds" integer,
  "distance_meters" integer,
  "average_pace_seconds_per_km" integer,
  "average_speed_meters_per_second" double precision,
  "total_ascent_meters" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "personal_activities_goal_length_check"
    CHECK (char_length(btrim("goal")) BETWEEN 1 AND 500),
  CONSTRAINT "personal_activities_title_length_check"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  CONSTRAINT "personal_activities_destination_length_check"
    CHECK (char_length(btrim("destination")) BETWEEN 1 AND 180),
  CONSTRAINT "personal_activities_type_check"
    CHECK ("activity_type" IN ('walk', 'run', 'cycle')),
  CONSTRAINT "personal_activities_status_check"
    CHECK ("status" IN ('planned', 'recording', 'paused', 'completed', 'discarded')),
  CONSTRAINT "personal_activities_metrics_check"
    CHECK (
      "planned_distance_meters" > 0
      AND ("planned_duration_seconds" IS NULL OR "planned_duration_seconds" >= 0)
      AND ("planned_ascent_meters" IS NULL OR "planned_ascent_meters" >= 0)
      AND "paused_seconds" >= 0
      AND ("elapsed_seconds" IS NULL OR "elapsed_seconds" >= 0)
      AND ("distance_meters" IS NULL OR "distance_meters" >= 0)
      AND ("average_pace_seconds_per_km" IS NULL OR "average_pace_seconds_per_km" >= 0)
      AND ("average_speed_meters_per_second" IS NULL OR "average_speed_meters_per_second" >= 0)
      AND ("total_ascent_meters" IS NULL OR "total_ascent_meters" >= 0)
    ),
  CONSTRAINT "personal_activities_tips_array_check"
    CHECK (jsonb_typeof("plan_tips") = 'array' AND jsonb_array_length("plan_tips") <= 8),
  CONSTRAINT "personal_activities_elevation_array_check"
    CHECK (jsonb_typeof("elevation_profile") = 'array' AND jsonb_array_length("elevation_profile") <= 512)
);

CREATE INDEX "personal_activities_owner_created_idx"
  ON "personal_activities" ("user_id", "created_at");
CREATE INDEX "personal_activities_owner_status_idx"
  ON "personal_activities" ("user_id", "status");

CREATE TABLE "personal_activity_points" (
  "activity_id" integer NOT NULL REFERENCES "personal_activities"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "accuracy_meters" double precision,
  "recorded_at" timestamptz NOT NULL,
  CONSTRAINT "personal_activity_points_pkey" PRIMARY KEY ("activity_id", "sequence"),
  CONSTRAINT "personal_activity_points_coordinate_check"
    CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "personal_activity_points_sequence_check"
    CHECK ("sequence" >= 0 AND ("accuracy_meters" IS NULL OR "accuracy_meters" >= 0))
);

COMMIT;
