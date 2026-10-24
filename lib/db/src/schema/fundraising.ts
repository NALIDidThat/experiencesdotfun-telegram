import { sql } from "drizzle-orm";
import { boolean, check, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable, organisationsTable, experiencesTable } from "./experiences";

export const organisationFundsTable = pgTable("organisation_funds", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisationsTable.id),
  experienceId: integer("experience_id").references(() => experiencesTable.id, { onDelete: "set null" }),
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

export const organisationFundMilestonesTable = pgTable("organisation_fund_milestones", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").notNull().references(() => organisationFundsTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  outcome: text("outcome").notNull(),
  targetSol: numeric("target_sol", { precision: 20, scale: 9 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  fundPositionUnique: uniqueIndex("organisation_fund_milestones_fund_position_unique").on(table.fundId, table.position),
  positionCheck: check("organisation_fund_milestones_position_check", sql`${table.position} > 0`),
  titleLengthCheck: check("organisation_fund_milestones_title_length_check", sql`char_length(${table.title}) BETWEEN 3 AND 80`),
  outcomeLengthCheck: check("organisation_fund_milestones_outcome_length_check", sql`char_length(${table.outcome}) BETWEEN 10 AND 300`),
  targetCheck: check("organisation_fund_milestones_target_check", sql`${table.targetSol} > 0 AND ${table.targetSol} <= 1000000000`),
}));

export const organisationTreasuriesTable = pgTable("organisation_treasuries", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisationsTable.id),
  walletAddress: text("wallet_address").notNull(),
  cluster: text("cluster").notNull().default("mainnet-beta"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  historyComplete: boolean("history_complete").notNull().default(false),
  historyCursor: text("history_cursor"),
}, (table) => ({
  organisationUnique: uniqueIndex("organisation_treasuries_organisation_unique").on(table.organisationId),
  walletUnique: uniqueIndex("organisation_treasuries_wallet_unique").on(table.walletAddress),
  clusterCheck: check("organisation_treasuries_cluster_check", sql`${table.cluster} IN ('mainnet-beta', 'devnet', 'testnet')`),
}));

export type OrganisationFund = typeof organisationFundsTable.$inferSelect;
export type OrganisationTreasury = typeof organisationTreasuriesTable.$inferSelect;

export const fundContributionsTable = pgTable("fund_contributions", {
  id: uuid("id").primaryKey(),
  fundId: integer("fund_id").notNull().references(() => organisationFundsTable.id),
  donorUserId: integer("donor_user_id").notNull().references(() => usersTable.id),
  amountLamports: numeric("amount_lamports", { precision: 20, scale: 0 }).notNull(),
  reference: text("reference").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  verificationMessage: text("verification_message"),
}, (table) => ({
  referenceUnique: uniqueIndex("fund_contributions_reference_unique").on(table.reference),
  donorIndex: index("fund_contributions_donor_idx").on(table.donorUserId, table.createdAt),
  pendingUnique: uniqueIndex("fund_contributions_pending_unique").on(table.donorUserId, table.fundId, table.amountLamports).where(sql`${table.status} = 'pending'`),
  statusCheck: check("fund_contributions_status_check", sql`${table.status} IN ('pending', 'cancelled', 'confirmed')`),
  amountCheck: check("fund_contributions_amount_check", sql`${table.amountLamports} > 0 AND ${table.amountLamports} <= 1000000000000000000`),
}));

export const treasuryDepositsTable = pgTable("treasury_deposits", {
  id: serial("id").primaryKey(),
  treasuryId: integer("treasury_id").notNull().references(() => organisationTreasuriesTable.id),
  fundId: integer("fund_id").references(() => organisationFundsTable.id),
  contributionId: uuid("contribution_id").references(() => fundContributionsTable.id),
  cluster: text("cluster").notNull(),
  signature: text("signature").notNull(),
  instructionIndex: text("instruction_index").notNull(),
  sender: text("sender").notNull(),
  amountLamports: numeric("amount_lamports", { precision: 20, scale: 0 }).notNull(),
  attribution: text("attribution").notNull().default("unattributed"),
  blockTime: timestamp("block_time", { withTimezone: true }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  transferUnique: uniqueIndex("treasury_deposits_transfer_unique").on(table.cluster, table.signature, table.instructionIndex),
  contributionUnique: uniqueIndex("treasury_deposits_contribution_unique").on(table.contributionId),
  treasuryIndex: index("treasury_deposits_treasury_idx").on(table.treasuryId, table.id),
  fundIndex: index("treasury_deposits_fund_idx").on(table.fundId),
  amountCheck: check("treasury_deposits_amount_check", sql`${table.amountLamports} > 0`),
  attributionCheck: check("treasury_deposits_attribution_check", sql`${table.attribution} IN ('reference', 'memo', 'unattributed')`),
  clusterCheck: check("treasury_deposits_cluster_check", sql`${table.cluster} IN ('mainnet-beta', 'devnet', 'testnet')`),
}));

export const treasuryPayoutsTable = pgTable("treasury_payouts", {
  id: uuid("id").primaryKey(),
  treasuryId: integer("treasury_id").notNull().references(() => organisationTreasuriesTable.id),
  fundId: integer("fund_id").references(() => organisationFundsTable.id),
  recipientUserId: integer("recipient_user_id").notNull().references(() => usersTable.id),
  walletAddress: text("wallet_address").notNull(),
  amountLamports: numeric("amount_lamports", { precision: 20, scale: 0 }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("proposed"),
  signature: text("signature"),
  instructionIndex: text("instruction_index"),
  cluster: text("cluster").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  verificationMessage: text("verification_message"),
}, (table) => ({
  transferUnique: uniqueIndex("treasury_payouts_transfer_unique").on(table.cluster, table.signature, table.instructionIndex),
  recipientIndex: index("treasury_payouts_recipient_idx").on(table.recipientUserId),
  treasuryIndex: index("treasury_payouts_treasury_idx").on(table.treasuryId),
  statusCheck: check("treasury_payouts_status_check", sql`${table.status} IN ('proposed','cancelled','paid')`),
  amountCheck: check("treasury_payouts_amount_check", sql`${table.amountLamports} > 0 AND ${table.amountLamports} <= 1000000000000000000`),
}));
