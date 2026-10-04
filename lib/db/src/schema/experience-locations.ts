import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { experiencesTable, usersTable } from "./experiences";

export const experienceLocationPrecisions = [
  "city",
  "neighborhood",
  "venue_area",
] as const;

export const experienceLocationSourceTypes = [
  "organisation_site",
  "venue_site",
  "public_partner_event",
] as const;

export const experienceLocationReviewStatuses = [
  "pending",
  "verified",
  "rejected",
] as const;

export const experienceLocationEvidenceTable = pgTable(
  "experience_location_evidence",
  {
    id: serial("id").primaryKey(),
    experienceId: integer("experience_id")
      .notNull()
      .references(() => experiencesTable.id, { onDelete: "cascade" }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    precision: text("precision", {
      enum: experienceLocationPrecisions,
    }).notNull(),
    sourceType: text("source_type", {
      enum: experienceLocationSourceTypes,
    }).notNull(),
    sourceUrl: text("source_url").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    consentedByUserId: integer("consented_by_user_id")
      .notNull()
      .references(() => usersTable.id),
    reviewStatus: text("review_status", {
      enum: experienceLocationReviewStatuses,
    })
      .notNull()
      .default("pending"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByUserId: integer("verified_by_user_id").references(
      () => usersTable.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    experienceIndex: uniqueIndex("experience_location_evidence_experience_idx")
      .on(table.experienceId),
    reviewQueueIndex: index("experience_location_evidence_review_idx")
      .on(table.reviewStatus, table.createdAt),
    latitudeCheck: check(
      "experience_location_evidence_latitude_check",
      sql`${table.latitude} >= -90 AND ${table.latitude} <= 90`,
    ),
    longitudeCheck: check(
      "experience_location_evidence_longitude_check",
      sql`${table.longitude} >= -180 AND ${table.longitude} <= 180`,
    ),
    precisionCheck: check(
      "experience_location_evidence_precision_check",
      sql`${table.precision} IN ('city', 'neighborhood', 'venue_area')`,
    ),
    sourceTypeCheck: check(
      "experience_location_evidence_source_type_check",
      sql`${table.sourceType} IN ('organisation_site', 'venue_site', 'public_partner_event')`,
    ),
    reviewStatusCheck: check(
      "experience_location_evidence_review_status_check",
      sql`${table.reviewStatus} IN ('pending', 'verified', 'rejected')`,
    ),
    sourceUrlCheck: check(
      "experience_location_evidence_source_url_check",
      sql`${table.sourceUrl} ~ '^https://'`,
    ),
    verificationCheck: check(
      "experience_location_evidence_verification_check",
      sql`(
        ${table.reviewStatus} = 'verified'
        AND ${table.verifiedAt} IS NOT NULL
        AND ${table.verifiedByUserId} IS NOT NULL
      ) OR (
        ${table.reviewStatus} <> 'verified'
        AND ${table.verifiedAt} IS NULL
        AND ${table.verifiedByUserId} IS NULL
      )`,
    ),
  }),
);

export type ExperienceLocationEvidence =
  typeof experienceLocationEvidenceTable.$inferSelect;