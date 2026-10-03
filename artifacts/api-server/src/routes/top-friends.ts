import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { SaveTopFriendsBody } from "@workspace/api-zod";
import {
  db,
  friendshipsTable,
  pinnedFriendsTable,
  usersTable,
} from "@workspace/db";
import { currentUser, requireTelegramUser } from "../lib/auth";

const router: IRouter = Router();
router.use(requireTelegramUser);

function friendSummary(user: {
  id: number;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  city: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    city: user.city,
  };
}

async function readTopFriends(userId: number) {
  const rows = await db
    .select({ friend: usersTable })
    .from(pinnedFriendsTable)
    .innerJoin(usersTable, eq(usersTable.id, pinnedFriendsTable.friendUserId))
    .innerJoin(
      friendshipsTable,
      and(
        eq(friendshipsTable.status, "accepted"),
        or(
          and(
            eq(friendshipsTable.requesterUserId, userId),
            eq(friendshipsTable.recipientUserId, pinnedFriendsTable.friendUserId),
          ),
          and(
            eq(friendshipsTable.recipientUserId, userId),
            eq(friendshipsTable.requesterUserId, pinnedFriendsTable.friendUserId),
          ),
        ),
      ),
    )
    .where(eq(pinnedFriendsTable.userId, userId))
    .orderBy(asc(pinnedFriendsTable.position));
  return rows.map(({ friend }) => friendSummary(friend));
}

router.get("/friends/top", async (req, res): Promise<void> => {
  res.json(await readTopFriends(currentUser(req).id));
});

router.put("/friends/top", async (req, res): Promise<void> => {
  const parsed = SaveTopFriendsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose up to three different friends." });
    return;
  }

  const user = currentUser(req);
  const friendIds = parsed.data.friendIds;
  if (new Set(friendIds).size !== friendIds.length || friendIds.includes(user.id)) {
    res.status(400).json({ message: "Choose up to three different friends." });
    return;
  }

  const result = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"top-friends:" + user.id}, 0))`,
    );

    if (friendIds.length > 0) {
      const acceptedFriendRows = await transaction
        .select({
          requesterUserId: friendshipsTable.requesterUserId,
          recipientUserId: friendshipsTable.recipientUserId,
        })
        .from(friendshipsTable)
        .where(
          and(
            eq(friendshipsTable.status, "accepted"),
            or(
              and(
                eq(friendshipsTable.requesterUserId, user.id),
                inArray(friendshipsTable.recipientUserId, friendIds),
              ),
              and(
                eq(friendshipsTable.recipientUserId, user.id),
                inArray(friendshipsTable.requesterUserId, friendIds),
              ),
            ),
          ),
        );
      const acceptedIds = new Set(
        acceptedFriendRows.map((row) =>
          row.requesterUserId === user.id ? row.recipientUserId : row.requesterUserId,
        ),
      );
      if (!friendIds.every((friendId) => acceptedIds.has(friendId))) {
        return { saved: false as const };
      }
    }

    await transaction
      .delete(pinnedFriendsTable)
      .where(eq(pinnedFriendsTable.userId, user.id));

    if (friendIds.length > 0) {
      await transaction.insert(pinnedFriendsTable).values(
        friendIds.map((friendUserId, position) => ({
          userId: user.id,
          friendUserId,
          position,
        })),
      );
    }

    const rows = await transaction
      .select({ friend: usersTable })
      .from(pinnedFriendsTable)
      .innerJoin(usersTable, eq(usersTable.id, pinnedFriendsTable.friendUserId))
      .where(eq(pinnedFriendsTable.userId, user.id))
      .orderBy(asc(pinnedFriendsTable.position));
    return { saved: true as const, friends: rows.map(({ friend }) => friendSummary(friend)) };
  });

  if (!result.saved) {
    res.status(409).json({ message: "Only accepted friends can be pinned." });
    return;
  }
  res.json(result.friends);
});

export default router;