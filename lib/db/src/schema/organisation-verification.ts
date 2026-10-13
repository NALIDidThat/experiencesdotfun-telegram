import { check, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organisationsTable, usersTable } from "./experiences";

export const organisationVerificationApplicationsTable = pgTable(
  "organisation_verification_applications",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisationsTable.id, { onDelete: "cascade" }),
    applicantUserId: integer("applicant_user_id")
      .notNull()
      .references(() => usersTable.id),
    legalName: text("legal_name"),
    organisationType: text("organisation_type"),
    jurisdiction: text("jurisdiction"),
    registrationNumber: text("registration_number"),
    website: text("website"),
    representativeName: text("representative_name"),
    representativeRole: text("representative_role"),
    contactEmail: text("contact_email"),
    evidenceObjectKeys: jsonb("evidence_object_keys").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("draft"),
    reviewerNotes: text("reviewer_notes"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organisationIndex: index("organisation_verification_applications_organisation_idx").on(table.organisationId),
    applicantIndex: index("organisation_verification_applications_applicant_idx").on(table.applicantUserId),
    statusCheck: check(
      "organisation_verification_applications_status_check",
      sql`${table.status} IN ('draft', 'pending', 'under_review', 'needs_information', 'verified', 'rejected', 'suspended', 'expired')`,
    ),
  }),
);

export const organisationVerificationEventsTable = pgTable(
  "organisation_verification_events",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisationsTable.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(
      () => organisationVerificationApplicationsTable.id,
      { onDelete: "set null" },
    ),
    actorUserId: integer("actor_user_id").references(() => usersTable.id),
    eventType: text("event_type").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organisationIndex: index("organisation_verification_events_organisation_idx").on(table.organisationId),
    applicationIndex: index("organisation_verification_events_application_idx").on(table.applicationId),
  }),
);
