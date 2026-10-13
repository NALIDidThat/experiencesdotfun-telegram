import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable, organisationsTable } from "./experiences";

export const organisationFundsTable = pgTable("organisation_funds", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisationsTable.id),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  walletAddress: text("wallet_address").notNull(),
  goalSol: numeric("goal_sol", { precision: 20, scale: 9 }).notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organisationIndex: index("organisation_funds_organisation_idx").on(table.organisationId),
  statusCheck: check("organisation_funds_status_check", sql`${table.status} IN ('active', 'closed')`),
  goalCheck: check("organisation_funds_goal_check", sql`${table.goalSol} > 0`),
}));

export const organisationTreasuriesTable = pgTable("organisation_treasuries", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisationsTable.id),
  walletAddress: text("wallet_address").notNull(),
  cluster: text("cluster").notNull().default("mainnet-beta"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organisationUnique: uniqueIndex("organisation_treasuries_organisation_unique").on(table.organisationId),
  walletUnique: uniqueIndex("organisation_treasuries_wallet_unique").on(table.walletAddress),
  clusterCheck: check("organisation_treasuries_cluster_check", sql`${table.cluster} IN ('mainnet-beta', 'devnet', 'testnet')`),
}));

export type OrganisationFund = typeof organisationFundsTable.$inferSelect;
export type OrganisationTreasury = typeof organisationTreasuriesTable.$inferSelect;
