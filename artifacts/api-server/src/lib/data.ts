import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  emailAccountsTable,
  experiencesTable,
  friendshipsTable,
  organisationsTable,
  participationsTable,
  usersTable,
  type Experience,
  type Organisation,
  type Participation,
  type User,
} from "@workspace/db/schema";

export const levelForXp = (xp: number): string => {
  if (xp >= 5000) return "Legend";
  if (xp >= 2500) return "Leader";
  if (xp >= 1500) return "Champion";
  if (xp >= 500) return "Contributor";
  return "Explorer";
};

export async function userResponse(user: User) {
  const [completed] = await db
    .select({ value: count() })
    .from(participationsTable)
    .where(
      and(
        eq(participationsTable.userId, user.id),
        eq(participationsTable.status, "verified"),
      ),
    );
  const [hosted] = await db
    .select({ value: count() })
    .from(experiencesTable)
    .innerJoin(
      organisationsTable,
      eq(experiencesTable.organisationId, organisationsTable.id),
    )
    .where(eq(organisationsTable.ownerUserId, user.id));
  const [rewards] = await db
    .select({
      value: sql<number>`coalesce(sum(${experiencesTable.monetaryRewardPence}), 0)`,
    })
    .from(participationsTable)
    .innerJoin(
      experiencesTable,
      eq(participationsTable.experienceId, experiencesTable.id),
    )
    .where(
      and(
        eq(participationsTable.userId, user.id),
        eq(participationsTable.status, "verified"),
      ),
    );

  const [emailAccount] = await db
    .select({ email: emailAccountsTable.email })
    .from(emailAccountsTable)
    .innerJoin(usersTable, eq(usersTable.id, emailAccountsTable.userId))
    .where(eq(usersTable.telegramId, user.telegramId))
    .limit(1);
  const organisation = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.ownerUserId, user.id),
    orderBy: desc(organisationsTable.createdAt),
  });

  const telegramId = Number(user.telegramId);
  return {
    id: user.id,
    createdAt: user.createdAt.toISOString(),
    telegramId: Number.isSafeInteger(telegramId) && telegramId > 0 ? telegramId : null,
    email: emailAccount?.email ?? null,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    city: user.city,
    country: user.country,
    interests: user.interests,
    participationType: user.participationType,
    userType: user.userType,
    organisation: organisation ? organisationResponse(organisation) : null,
    xp: user.xp,
    level: levelForXp(user.xp),
    completedCount: Number(completed?.value ?? 0),
    hostedCount: Number(hosted?.value ?? 0),
    rewardsPence: Number(rewards?.value ?? 0),
  };
}

export async function friendProfileResponse(user: User) {
  const [completed] = await db
    .select({ value: count() })
    .from(participationsTable)
    .where(
      and(
        eq(participationsTable.userId, user.id),
        eq(participationsTable.status, "verified"),
      ),
    );
  const [hosted] = await db
    .select({ value: count() })
    .from(experiencesTable)
    .innerJoin(
      organisationsTable,
      eq(experiencesTable.organisationId, organisationsTable.id),
    )
    .where(eq(organisationsTable.ownerUserId, user.id));
  const [friends] = await db
    .select({ value: count() })
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.status, "accepted"),
        or(
          eq(friendshipsTable.requesterUserId, user.id),
          eq(friendshipsTable.recipientUserId, user.id),
        ),
      ),
    );
  const organisation = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.ownerUserId, user.id),
    orderBy: desc(organisationsTable.createdAt),
  });

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    city: user.city,
    interests: user.interests,
    userType: user.userType,
    organisation: organisation ? organisationResponse(organisation) : null,
    xp: user.xp,
    level: levelForXp(user.xp),
    completedCount: Number(completed?.value ?? 0),
    hostedCount: Number(hosted?.value ?? 0),
    friendsCount: Number(friends?.value ?? 0),
    memberSince: user.createdAt.toISOString(),
  };
}

export function organisationResponse(organisation: Organisation) {
  return {
    id: organisation.id,
    name: organisation.name,
    description: organisation.description,
    city: organisation.city,
    country: organisation.country,
    categories: organisation.categories,
    verified: organisation.verified,
  };
}

export async function experienceResponse(experience: Experience) {
  const organisation = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, experience.organisationId),
  });
  if (!organisation) throw new Error("Experience organisation is missing.");
  const [participantCount] = await db
    .select({ value: count() })
    .from(participationsTable)
    .where(
      and(
        eq(participationsTable.experienceId, experience.id),
        inArray(participationsTable.status, [
          "joined",
          "attended",
          "submitted",
          "verified",
        ]),
      ),
    );
  const participants = Number(participantCount?.value ?? 0);
  return {
    id: experience.id,
    organisation: organisationResponse(organisation),
    title: experience.title,
    description: experience.description,
    category: experience.category,
    date: experience.date,
    startTime: experience.startTime,
    endTime: experience.endTime,
    location: experience.location,
    city: experience.city,
    capacity: experience.capacity,
    participantCount: participants,
    availablePlaces: Math.max(experience.capacity - participants, 0),
    xpReward: experience.xpReward,
    monetaryRewardPence: experience.monetaryRewardPence,
    status: participants >= experience.capacity ? "full" : experience.status,
  };
}

export async function participationResponse(
  participation: Participation,
  includeParticipant = true,
) {
  const experience = await db.query.experiencesTable.findFirst({
    where: eq(experiencesTable.id, participation.experienceId),
  });
  if (!experience) throw new Error("Participation experience is missing.");
  const participant = includeParticipant
    ? await db.query.usersTable.findFirst({
        where: eq(usersTable.id, participation.userId),
      })
    : undefined;
  return {
    id: participation.id,
    experience: await experienceResponse(experience),
    participant: {
      id: participant?.id ?? participation.userId,
      name: participant?.name ?? "Participant",
      username: participant?.username ?? null,
    },
    status: participation.status,
    joinedAt: participation.joinedAt.toISOString(),
    attendedAt: participation.attendedAt?.toISOString() ?? null,
    submittedAt: participation.submittedAt?.toISOString() ?? null,
    verifiedAt: participation.verifiedAt?.toISOString() ?? null,
    rewardStatus: participation.rewardStatus,
  };
}

export async function currentOrganisation(userId: number) {
  return db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.ownerUserId, userId),
    orderBy: desc(organisationsTable.createdAt),
  });
}

export const friendUserCondition = (userId: number) =>
  or(
    eq(sql<number>`requester_user_id`, userId),
    eq(sql<number>`recipient_user_id`, userId),
  );