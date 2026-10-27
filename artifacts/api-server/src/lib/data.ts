import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  emailAccountsTable,
  experiencesTable,
  experienceLocationEvidenceTable,
  friendshipsTable,
  organisationsTable,
  participationReviewEventsTable,
  participationsTable,
  usersTable,
  type Experience,
  type Organisation,
  type Participation,
  type User,
} from "@workspace/db/schema";
import { toPublicVerifiedLocation } from "./experience-location-rules.mjs";
import { getExperienceXpProgress } from "./xp-progression.mjs";

export const levelForXp = (xp: number): string => getExperienceXpProgress(xp).level;

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
    .where(eq(emailAccountsTable.userId, user.id))
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
    socialLinks: user.socialLinks ?? {},
    participationType: user.participationType,
    userType: user.userType,
    organisation: organisation ? organisationResponse(organisation) : null,
    xp: user.xp,
    ...getExperienceXpProgress(user.xp),
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
    socialLinks: user.socialLinks ?? {},
    userType: user.userType,
    organisation: organisation ? organisationResponse(organisation) : null,
    xp: user.xp,
    ...getExperienceXpProgress(user.xp),
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
    type: organisation.organisationType ?? null,
    verified: organisation.verificationStatus === "verified",
  };
}

export async function experienceResponse(experience: Experience) {
  const [organisation, participantCount, locationEvidence] = await Promise.all([
    db.query.organisationsTable.findFirst({
      where: eq(organisationsTable.id, experience.organisationId),
    }),
    db
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
      )
      .then((rows) => rows[0]),
    db.query.experienceLocationEvidenceTable.findFirst({
      where: eq(experienceLocationEvidenceTable.experienceId, experience.id),
    }),
  ]);
  if (!organisation) throw new Error("Experience organisation is missing.");
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
    verifiedLocation: toPublicVerifiedLocation(locationEvidence),
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
  const reviewHistory = await db
    .select({
      decision: participationReviewEventsTable.decision,
      reason: participationReviewEventsTable.reason,
      reviewerName: usersTable.name,
      createdAt: participationReviewEventsTable.createdAt,
    })
    .from(participationReviewEventsTable)
    .innerJoin(usersTable, eq(usersTable.id, participationReviewEventsTable.reviewerUserId))
    .where(eq(participationReviewEventsTable.participationId, participation.id))
    .orderBy(asc(participationReviewEventsTable.createdAt));
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
    completionStatement: participation.completionStatement ?? null,
    evidenceObjectKeys: participation.evidenceObjectKeys ?? [],
    submissionVersion: participation.submissionVersion,
    reviewReason: participation.reviewReason ?? null,
    reviewedAt: participation.reviewedAt?.toISOString() ?? null,
    reviewHistory: reviewHistory.map((event) => ({
      decision: event.decision,
      reason: event.reason,
      reviewerName: event.reviewerName,
      createdAt: event.createdAt.toISOString(),
    })),
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