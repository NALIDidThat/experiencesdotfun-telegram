import {
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./experiences";

export const xpLeagueCategories = [
  "environmental",
  "education",
  "community",
] as const;
export type XpLeagueCategory = (typeof xpLeagueCategories)[number];

export const xpLeagueMembershipsTable = pgTable(
  "xp_league_memberships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    category: text("category", { enum: xpLeagueCategories }).notNull(),
    optedInAt: timestamp("opted_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    division: integer("division").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCategoryUnique: uniqueIndex("xp_league_memberships_user_category_idx").on(
      table.userId,
      table.category,
    ),
    categoryActiveIndex: index("xp_league_memberships_category_active_idx").on(
      table.category,
      table.optedOutAt,
      table.division,
      table.userId,
    ),
    categoryCheck: check(
      "xp_league_memberships_category_check",
      sql`${table.category} IN ('environmental', 'education', 'community')`,
    ),
    divisionCheck: check(
      "xp_league_memberships_division_check",
      sql`${table.division} BETWEEN 1 AND 3`,
    ),
    optOutCheck: check(
      "xp_league_memberships_opt_out_check",
      sql`${table.optedOutAt} IS NULL OR ${table.optedOutAt} >= ${table.optedInAt}`,
    ),
  }),
);

export const xpLeagueStandingsTable = pgTable(
  "xp_league_standings",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    category: text("category", { enum: xpLeagueCategories }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    division: integer("division").notNull(),
    scoreXp: integer("score_xp").notNull(),
    rank: integer("rank").notNull(),
    movement: text("movement", { enum: ["held", "promoted", "demoted"] })
      .notNull()
      .default("held"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    weekCategoryUserUnique: uniqueIndex("xp_league_standings_week_category_user_idx").on(
      table.weekStart,
      table.category,
      table.userId,
    ),
    userHistoryIndex: index("xp_league_standings_user_history_idx").on(
      table.userId,
      table.category,
      table.weekStart,
    ),
    leagueHistoryIndex: index("xp_league_standings_league_history_idx").on(
      table.category,
      table.weekStart,
      table.division,
      table.rank,
    ),
    categoryCheck: check(
      "xp_league_standings_category_check",
      sql`${table.category} IN ('environmental', 'education', 'community')`,
    ),
    divisionCheck: check(
      "xp_league_standings_division_check",
      sql`${table.division} BETWEEN 1 AND 3`,
    ),
    scoreCheck: check(
      "xp_league_standings_score_check",
      sql`${table.scoreXp} >= 0`,
    ),
    rankCheck: check(
      "xp_league_standings_rank_check",
      sql`${table.rank} >= 1`,
    ),
    movementCheck: check(
      "xp_league_standings_movement_check",
      sql`${table.movement} IN ('held', 'promoted', 'demoted')`,
    ),
  }),
);

export const xpLeagueWeeksTable = pgTable(
  "xp_league_weeks",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    category: text("category", { enum: xpLeagueCategories }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    weekCategoryUnique: uniqueIndex("xp_league_weeks_week_category_idx").on(
      table.weekStart,
      table.category,
    ),
    categoryWeekIndex: index("xp_league_weeks_category_week_idx").on(
      table.category,
      table.weekStart,
    ),
    categoryCheck: check(
      "xp_league_weeks_category_check",
      sql`${table.category} IN ('environmental', 'education', 'community')`,
    ),
  }),
);

export type XpLeagueMembership = typeof xpLeagueMembershipsTable.$inferSelect;
export type XpLeagueStanding = typeof xpLeagueStandingsTable.$inferSelect;
