import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { usersTable } from "./experiences";

export const personalActivityTypes = ["walk", "run", "cycle"] as const;
export const personalActivityStatuses = [
  "planned",
  "recording",
  "paused",
  "completed",
  "discarded",
] as const;

export type PersonalActivityType = (typeof personalActivityTypes)[number];
export type PersonalActivityStatus = (typeof personalActivityStatuses)[number];
export type PersonalActivityElevationPoint = {
  distanceMeters: number;
  elevationMeters: number;
  resolutionMeters: number | null;
};
export type PersonalActivityRoutePoint = {
  sequence: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
};

export const personalActivitiesTable = pgTable(
  "personal_activities",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    goal: text("goal").notNull(),
    activityType: text("activity_type", { enum: personalActivityTypes }).notNull(),
    destination: text("destination").notNull(),
    planSummary: text("plan_summary").notNull(),
    planTips: jsonb("plan_tips").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    routePolyline: text("route_polyline").notNull(),
    plannedDistanceMeters: integer("planned_distance_meters").notNull(),
    plannedDurationSeconds: integer("planned_duration_seconds"),
    plannedAscentMeters: integer("planned_ascent_meters"),
    elevationProfile: jsonb("elevation_profile")
      .$type<PersonalActivityElevationPoint[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status", { enum: personalActivityStatuses }).notNull().default("planned"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedSeconds: integer("paused_seconds").notNull().default(0),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    elapsedSeconds: integer("elapsed_seconds"),
    distanceMeters: integer("distance_meters"),
    averagePaceSecondsPerKm: integer("average_pace_seconds_per_km"),
    averageSpeedMetersPerSecond: doublePrecision("average_speed_meters_per_second"),
    totalAscentMeters: integer("total_ascent_meters"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerCreatedIndex: index("personal_activities_owner_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    ownerStatusIndex: index("personal_activities_owner_status_idx").on(
      table.userId,
      table.status,
    ),
    goalLengthCheck: check(
      "personal_activities_goal_length_check",
      sql`char_length(btrim(${table.goal})) BETWEEN 1 AND 500`,
    ),
    titleLengthCheck: check(
      "personal_activities_title_length_check",
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`,
    ),
    destinationLengthCheck: check(
      "personal_activities_destination_length_check",
      sql`char_length(btrim(${table.destination})) BETWEEN 1 AND 180`,
    ),
    activityTypeCheck: check(
      "personal_activities_type_check",
      sql`${table.activityType} IN ('walk', 'run', 'cycle')`,
    ),
    statusCheck: check(
      "personal_activities_status_check",
      sql`${table.status} IN ('planned', 'recording', 'paused', 'completed', 'discarded')`,
    ),
    metricsCheck: check(
      "personal_activities_metrics_check",
      sql`${table.plannedDistanceMeters} > 0
        AND (${table.plannedDurationSeconds} IS NULL OR ${table.plannedDurationSeconds} >= 0)
        AND (${table.plannedAscentMeters} IS NULL OR ${table.plannedAscentMeters} >= 0)
        AND ${table.pausedSeconds} >= 0
        AND (${table.elapsedSeconds} IS NULL OR ${table.elapsedSeconds} >= 0)
        AND (${table.distanceMeters} IS NULL OR ${table.distanceMeters} >= 0)
        AND (${table.averagePaceSecondsPerKm} IS NULL OR ${table.averagePaceSecondsPerKm} >= 0)
        AND (${table.averageSpeedMetersPerSecond} IS NULL OR ${table.averageSpeedMetersPerSecond} >= 0)
        AND (${table.totalAscentMeters} IS NULL OR ${table.totalAscentMeters} >= 0)`,
    ),
    tipsArrayCheck: check(
      "personal_activities_tips_array_check",
      sql`jsonb_typeof(${table.planTips}) = 'array' AND jsonb_array_length(${table.planTips}) <= 8`,
    ),
    elevationArrayCheck: check(
      "personal_activities_elevation_array_check",
      sql`jsonb_typeof(${table.elevationProfile}) = 'array' AND jsonb_array_length(${table.elevationProfile}) <= 512`,
    ),
  }),
);

export const personalActivityPointsTable = pgTable(
  "personal_activity_points",
  {
    activityId: integer("activity_id")
      .notNull()
      .references(() => personalActivitiesTable.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    accuracyMeters: doublePrecision("accuracy_meters"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    primary: primaryKey({
      columns: [table.activityId, table.sequence],
      name: "personal_activity_points_pkey",
    }),
    coordinateCheck: check(
      "personal_activity_points_coordinate_check",
      sql`${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180`,
    ),
    sequenceCheck: check(
      "personal_activity_points_sequence_check",
      sql`${table.sequence} >= 0 AND (${table.accuracyMeters} IS NULL OR ${table.accuracyMeters} >= 0)`,
    ),
  }),
);

export type PersonalActivity = typeof personalActivitiesTable.$inferSelect;
export type PersonalActivityPoint = typeof personalActivityPointsTable.$inferSelect;
