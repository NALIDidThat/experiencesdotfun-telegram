import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  friendNotificationsTable,
  friendshipsTable,
  type Friendship,
} from "@workspace/db/schema";

export type FriendRequestResult =
  | { outcome: "created" | "reopened"; request: Friendship }
  | { outcome: "exists"; request: Friendship };

function friendshipBetween(a: number, b: number) {
  return or(
    and(eq(friendshipsTable.requesterUserId, a), eq(friendshipsTable.recipientUserId, b)),
    and(eq(friendshipsTable.requesterUserId, b), eq(friendshipsTable.recipientUserId, a)),
  );
}

export async function createOrReopenFriendRequest(
  requesterUserId: number,
  recipientUserId: number,
): Promise<FriendRequestResult> {
  if (requesterUserId === recipientUserId) {
    throw new Error("Users cannot send friend requests to themselves.");
  }

  const lowerId = Math.min(requesterUserId, recipientUserId);
  const higherId = Math.max(requesterUserId, recipientUserId);

  return db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(${lowerId}, ${higherId})`);

    const [existing] = await transaction
      .select()
      .from(friendshipsTable)
      .where(friendshipBetween(requesterUserId, recipientUserId))
      .limit(1);

    if (existing?.status === "pending" || existing?.status === "accepted") {
      return { outcome: "exists", request: existing };
    }

    if (existing) {
      const [reopened] = await transaction
        .update(friendshipsTable)
        .set({
          requesterUserId,
          recipientUserId,
          status: "pending",
          acceptedAt: null,
          createdAt: new Date(),
        })
        .where(eq(friendshipsTable.id, existing.id))
        .returning();
      if (!reopened) throw new Error("Unable to reopen friend request.");
      await transaction.insert(friendNotificationsTable).values({
        friendshipId: reopened.id,
        actorUserId: requesterUserId,
        recipientUserId,
        type: "friend_request",
      });
      return { outcome: "reopened", request: reopened };
    }

    const [created] = await transaction
      .insert(friendshipsTable)
      .values({ requesterUserId, recipientUserId })
      .returning();
    if (!created) throw new Error("Unable to create friend request.");
    await transaction.insert(friendNotificationsTable).values({
      friendshipId: created.id,
      actorUserId: requesterUserId,
      recipientUserId,
      type: "friend_request",
    });
    return { outcome: "created", request: created };
  });
}

export async function updateFriendRequestStatus(
  requestId: number,
  recipientUserId: number,
  status: "accepted" | "declined",
): Promise<Friendship | undefined> {
  return db.transaction(async (transaction) => {
    const [request] = await transaction
      .select()
      .from(friendshipsTable)
      .where(
        and(
          eq(friendshipsTable.id, requestId),
          eq(friendshipsTable.recipientUserId, recipientUserId),
          eq(friendshipsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (!request) return undefined;

    const [updated] = await transaction
      .update(friendshipsTable)
      .set({ status, acceptedAt: status === "accepted" ? new Date() : null })
      .where(
        and(
          eq(friendshipsTable.id, request.id),
          eq(friendshipsTable.recipientUserId, recipientUserId),
          eq(friendshipsTable.status, "pending"),
        ),
      )
      .returning();
    if (!updated) return undefined;

    await transaction.insert(friendNotificationsTable).values({
      friendshipId: updated.id,
      actorUserId: recipientUserId,
      recipientUserId: request.requesterUserId,
      type: status === "accepted" ? "friend_request_accepted" : "friend_request_declined",
    });
    return updated;
  });
}
