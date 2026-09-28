export async function redeemPendingXpAwards(pool, userId, now = new Date()) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const { rows: awards } = await client.query(
      `UPDATE public.xp_awards
       SET status = 'redeemed', redeemed_at = $2
       WHERE user_id = $1 AND status = 'pending'
       RETURNING amount`,
      [userId, now],
    );
    const redeemedXp = awards.reduce(
      (total, award) => total + Number(award.amount),
      0,
    );

    let profile;
    if (redeemedXp > 0) {
      const result = await client.query(
        `UPDATE public.users
         SET xp = xp + $1, updated_at = $2
         WHERE id = $3
         RETURNING id, xp`,
        [redeemedXp, now, userId],
      );
      [profile] = result.rows;
    } else {
      const result = await client.query(
        "SELECT id, xp FROM public.users WHERE id = $1",
        [userId],
      );
      [profile] = result.rows;
    }

    if (!profile) {
      throw new Error("Profile not found while redeeming Experience XP.");
    }

    await client.query("COMMIT");
    return {
      redeemedXp,
      balanceXp: Number(profile.xp),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}