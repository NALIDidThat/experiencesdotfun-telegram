import type { Pool } from "pg";

export function redeemPendingXpAwards(
  pool: Pool,
  userId: number,
  now?: Date,
): Promise<{ redeemedXp: number; balanceXp: number }>;