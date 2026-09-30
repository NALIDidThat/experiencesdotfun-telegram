import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  friendNotificationsTable,
  friendshipsTable,
  accountabilityEventsTable,
  accountabilityPartnershipsTable,
  socialInvitesTable,
  usersTable,
  type Friendship,
} from "@workspace/db/schema";

export type FriendRequestResult =
  | { outcome: "created" | "reopened"; request: Friendship }
  | { outcome: "exists"; request: Friendship };

export type UpdatedFriendship = Friendship & { accountabilityInviteCreated?: true };

function friendshipBetween(a: number, b: number) {
  return or(
    and(eq(friendshipsTable.requesterUserId, a), eq(friendshipsTable.recipientUserId, b)),
    and(eq(friendshipsTable.requesterUserId, b), eq(friendshipsTable.recipientUserId, a)),
  );
}

export async function createOrReopenFriendRequest(
  requesterUserId: number,
  recipientUserId: number,
  socialInviteId?: number,
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
          socialInviteId: socialInviteId ?? null,
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
        .values({ requesterUserId, recipientUserId, socialInviteId: socialInviteId ?? null })
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
): Promise<UpdatedFriendship | undefined> {
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
    let accountabilityInviteCreated = false;
    if (status === "accepted" && request.socialInviteId) {
      const [invite] = await transaction.select().from(socialInvitesTable)
        .where(and(eq(socialInvitesTable.id, request.socialInviteId), eq(socialInvitesTable.kind, "accountability")))
        .limit(1);
      if (invite) {
        const participants = await transaction.select({ id: usersTable.id, userType: usersTable.userType })
          .from(usersTable)
          .where(or(eq(usersTable.id, request.requesterUserId), eq(usersTable.id, request.recipientUserId)));
        if (participants.length < 2 || participants.some((user) => user.userType !== "participant")) {
          return updated;
        }
        const [activePartnership] = await transaction.select({ id: accountabilityPartnershipsTable.id })
          .from(accountabilityPartnershipsTable)
          .where(and(
            eq(accountabilityPartnershipsTable.status, "active"),
            or(
              eq(accountabilityPartnershipsTable.requesterUserId, request.requesterUserId),
              eq(accountabilityPartnershipsTable.recipientUserId, request.requesterUserId),
              eq(accountabilityPartnershipsTable.requesterUserId, request.recipientUserId),
              eq(accountabilityPartnershipsTable.recipientUserId, request.recipientUserId),
            ),
          ))
          .limit(1);
        if (activePartnership) return updated;
        const [existingPartnership] = await transaction.select().from(accountabilityPartnershipsTable)
          .where(or(
            and(eq(accountabilityPartnershipsTable.requesterUserId, request.requesterUserId), eq(accountabilityPartnershipsTable.recipientUserId, request.recipientUserId)),
            and(eq(accountabilityPartnershipsTable.requesterUserId, request.recipientUserId), eq(accountabilityPartnershipsTable.recipientUserId, request.requesterUserId)),
          )).limit(1);
        if (
          existingPartnership?.status !== "active" &&
          !(existingPartnership?.status === "pending" && existingPartnership.expiresAt > new Date())
        ) {
          const [partnership] = existingPartnership
            ? await transaction.update(accountabilityPartnershipsTable).set({
                requesterUserId: request.requesterUserId, recipientUserId: request.recipientUserId,
                status: "pending", createdAt: new Date(),
                expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                acceptedAt: null, endedAt: null,
              }).where(eq(accountabilityPartnershipsTable.id, existingPartnership.id)).returning()
            : await transaction.insert(accountabilityPartnershipsTable).values({
                requesterUserId: request.requesterUserId, recipientUserId: request.recipientUserId,
                status: "pending", expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              }).returning();
          if (partnership) {
            await transaction.insert(accountabilityEventsTable).values({
              partnershipId: partnership.id,
              actorUserId: request.requesterUserId,
              recipientUserId: request.recipientUserId,
              type: "partner_invite",
              title: "Partner invitation",
              message: "Your new friend invited you to be their accountability partner.",
            });
            accountabilityInviteCreated = true;
          }
        }
      }
    }
    return accountabilityInviteCreated ? { ...updated, accountabilityInviteCreated: true } : updated;
  });
}
