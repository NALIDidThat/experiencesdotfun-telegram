import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  friendshipsTable,
  friendNotificationsTable,
  socialInvitesTable,
  usersTable,
  type User,
} from "@workspace/db/schema";
import {
  canClaimSocialInvite,
  createInviteToken,
  inviteTokenHash,
  shareUrl,
} from "./social-invite-utils";

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SocialInviteKind = "friend" | "accountability";

export async function createSocialInvite(
  inviter: User,
  targetUsername: string,
  kind: SocialInviteKind,
) {
  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [invite] = await db.insert(socialInvitesTable).values({
    tokenHash: inviteTokenHash(token),
    inviterUserId: inviter.id,
    targetUsername: targetUsername.replace(/^@/, "").trim().toLowerCase(),
    kind,
    expiresAt,
  }).returning({ kind: socialInvitesTable.kind, expiresAt: socialInvitesTable.expiresAt });
  if (!invite) throw new Error("Unable to create social invite.");
  return { url: shareUrl(token), kind: invite.kind, expiresAt: invite.expiresAt.toISOString() };
}

/**
 * Claims and converts an invite into the ordinary friend request in one
 * transaction. A claimed invite is deliberately harmless on replay.
 */
export async function claimSocialInvite(token: string, invitedUser: User) {
  const hash = inviteTokenHash(token);
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(socialInvitesTable)
      .where(eq(socialInvitesTable.tokenHash, hash)).limit(1);
    if (!invite || !canClaimSocialInvite(invite, invitedUser.username)) {
      return { outcome: "ignored" as const };
    }
    const [inviter] = await tx.select().from(usersTable).where(eq(usersTable.id, invite.inviterUserId)).limit(1);
    if (!inviter || inviter.id === invitedUser.id ||
        (invite.kind === "accountability" && inviter.userType !== "participant")) {
      return { outcome: "ignored" as const };
    }
    await tx.execute(sql`select pg_advisory_xact_lock(${Math.min(inviter.id, invitedUser.id)}, ${Math.max(inviter.id, invitedUser.id)})`);
    const [claimed] = await tx.update(socialInvitesTable).set({
      claimedAt: new Date(), claimedUserId: invitedUser.id,
    }).where(and(
      eq(socialInvitesTable.id, invite.id),
      isNull(socialInvitesTable.claimedAt),
      gt(socialInvitesTable.expiresAt, new Date()),
    )).returning();
    if (!claimed) return { outcome: "replayed" as const };

    const [existing] = await tx.select().from(friendshipsTable).where(or(
      and(eq(friendshipsTable.requesterUserId, inviter.id), eq(friendshipsTable.recipientUserId, invitedUser.id)),
      and(eq(friendshipsTable.requesterUserId, invitedUser.id), eq(friendshipsTable.recipientUserId, inviter.id)),
    )).limit(1);
    if (existing?.status === "accepted" || existing?.status === "pending") {
      return { outcome: "already_exists" as const, kind: invite.kind };
    }
    const [request] = existing
      ? await tx.update(friendshipsTable).set({
          requesterUserId: inviter.id, recipientUserId: invitedUser.id,
          status: "pending", acceptedAt: null, createdAt: new Date(), socialInviteId: invite.id,
        }).where(eq(friendshipsTable.id, existing.id)).returning()
      : await tx.insert(friendshipsTable).values({
          requesterUserId: inviter.id, recipientUserId: invitedUser.id, socialInviteId: invite.id,
        }).returning();
    if (!request) throw new Error("Unable to create invited friend request.");
    await tx.insert(friendNotificationsTable).values({
      friendshipId: request.id, actorUserId: inviter.id, recipientUserId: invitedUser.id, type: "friend_request",
    });
    return { outcome: "created" as const, kind: invite.kind, request, inviter };
  });
}