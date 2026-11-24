import {
  and,
  count,
  desc,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateCommunityMissionBody,
  CreateSocialQuestBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  accountabilityPartnershipsTable,
  communityContributionsTable,
  experiencesTable,
  friendshipsTable,
  participationsTable,
  sharedQuestNotificationsTable,
  sharedQuestParticipantsTable,
  sharedQuestsTable,
  usersTable,
  type User,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  canInviteToSocialQuest,
  canJoinSocialQuest,
  canViewSocialQuest as canViewSocialQuestRule,
  canGrantCompletionRecognition,
  isQualifiedCommunityContribution,
  isTrustedSocialQuestCompletion,
  shouldCompleteCommunityMission,
  SOCIAL_QUEST_INVITEE_LIMIT,
  COMMUNITY_MISSION_TARGET_LIMIT,
} from "../lib/shared-quest-rules.mjs";

const router: IRouter = Router();
router.use(requireTelegramUser);

type QuestTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QuestKind = "social" | "community";

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function participantSummary(user: Pick<User, "id" | "name" | "username" | "avatarUrl">) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

function isParticipant(user: User, res: Response): boolean {
  if (user.userType === "participant") return true;
  sendError(
    res,
    user.userType === null ? 409 : 403,
    user.userType === null
      ? "Choose a participant profile before using shared objectives."
      : "Shared objectives are available to participant profiles.",
  );
  return false;
}

let schemaAvailablePromise: Promise<boolean> | undefined;

async function sharedQuestSchemaAvailable() {
  schemaAvailablePromise ??= db
    .execute(sql`
      SELECT to_regclass('shared_quests') IS NOT NULL AS quests,
             to_regclass('shared_quest_participants') IS NOT NULL AS participants,
             to_regclass('shared_quest_notifications') IS NOT NULL AS notifications
    `)
    .then((result) => {
      const row = result.rows[0] as
        | { quests: boolean; participants: boolean; notifications: boolean }
        | undefined;
      return Boolean(row?.quests && row.participants && row.notifications);
    });
  return schemaAvailablePromise;
}

async function requireSchema(res: Response) {
  if (await sharedQuestSchemaAvailable()) return true;
  sendError(
    res,
    503,
    "Shared objectives are unavailable until their database migration is applied.",
  );
  return false;
}

async function relationshipStatus(firstUserId: number, secondUserId: number) {
  if (firstUserId === secondUserId) {
    return { friendshipStatus: undefined, partnershipStatus: undefined };
  }
  const [friendship, partnership] = await Promise.all([
    db.query.friendshipsTable.findFirst({
      where: and(
        eq(friendshipsTable.status, "accepted"),
        or(
          and(
            eq(friendshipsTable.requesterUserId, firstUserId),
            eq(friendshipsTable.recipientUserId, secondUserId),
          ),
          and(
            eq(friendshipsTable.requesterUserId, secondUserId),
            eq(friendshipsTable.recipientUserId, firstUserId),
          ),
        ),
      ),
      columns: { status: true },
    }),
    db.query.accountabilityPartnershipsTable.findFirst({
      where: and(
        eq(accountabilityPartnershipsTable.status, "active"),
        or(
          and(
            eq(accountabilityPartnershipsTable.requesterUserId, firstUserId),
            eq(accountabilityPartnershipsTable.recipientUserId, secondUserId),
          ),
          and(
            eq(accountabilityPartnershipsTable.requesterUserId, secondUserId),
            eq(accountabilityPartnershipsTable.recipientUserId, firstUserId),
          ),
        ),
      ),
      columns: { status: true },
    }),
  ]);
  return {
    friendshipStatus: friendship?.status,
    partnershipStatus: partnership?.status,
  };
}

async function hasCommunityContribution(userId: number, chatId: string) {
  const rows = await db
    .select({
      contributionType: communityContributionsTable.contributionType,
      qualificationReason: communityContributionsTable.qualificationReason,
      xpAwarded: communityContributionsTable.xpAwarded,
    })
    .from(communityContributionsTable)
    .where(
      and(
        eq(communityContributionsTable.chatId, chatId),
        eq(communityContributionsTable.userId, userId),
        eq(communityContributionsTable.contributionType, "telegram_message"),
        eq(communityContributionsTable.qualificationReason, "qualified"),
        gt(communityContributionsTable.xpAwarded, 0),
      ),
    )
    .limit(25);
  return rows.some(isQualifiedCommunityContribution);
}

async function addQuestNotification(
  tx: QuestTx,
  input: {
    questId: number;
    recipientUserId: number;
    actorUserId: number;
    type: "invitation" | "participant_completed" | "quest_completed" | "reward_granted";
  },
) {
  await tx
    .insert(sharedQuestNotificationsTable)
    .values(input)
    .onConflictDoNothing({
      target: [
        sharedQuestNotificationsTable.questId,
        sharedQuestNotificationsTable.recipientUserId,
        sharedQuestNotificationsTable.actorUserId,
        sharedQuestNotificationsTable.type,
      ],
    });
}

async function reconcileSocialQuest(questId: number) {
  const quest = await db.query.sharedQuestsTable.findFirst({
    where: and(
      eq(sharedQuestsTable.id, questId),
      eq(sharedQuestsTable.kind, "social"),
    ),
  });
  if (!quest || quest.status !== "active" || !quest.experienceId) return;

  const acceptedParticipants = await db
    .select({
      participant: sharedQuestParticipantsTable,
      participationStatus: participationsTable.status,
    })
    .from(sharedQuestParticipantsTable)
    .innerJoin(
      participationsTable,
      and(
        eq(participationsTable.experienceId, quest.experienceId),
        eq(participationsTable.userId, sharedQuestParticipantsTable.userId),
        eq(participationsTable.status, "verified"),
      ),
    )
    .where(
      and(
        eq(sharedQuestParticipantsTable.questId, questId),
        eq(sharedQuestParticipantsTable.status, "active"),
      ),
    );

  for (const row of acceptedParticipants) {
    if (
      !isTrustedSocialQuestCompletion({ participationStatus: row.participationStatus }) ||
      !canGrantCompletionRecognition({
        participantStatus: row.participant.status,
        rewardGrantedAt: row.participant.rewardGrantedAt,
      })
    ) continue;
    await db.transaction(async (tx) => {
      const [completed] = await tx
        .update(sharedQuestParticipantsTable)
        .set({
          status: "completed",
          completedAt: new Date(),
          rewardGrantedAt: new Date(),
        })
        .where(
          and(
            eq(sharedQuestParticipantsTable.id, row.participant.id),
            eq(sharedQuestParticipantsTable.status, "active"),
            isNull(sharedQuestParticipantsTable.rewardGrantedAt),
          ),
        )
        .returning({ userId: sharedQuestParticipantsTable.userId });
      if (!completed) return;

      await addQuestNotification(tx, {
        questId,
        recipientUserId: completed.userId,
        actorUserId: completed.userId,
        type: "reward_granted",
      });
      const peers = await tx
        .select({ userId: sharedQuestParticipantsTable.userId })
        .from(sharedQuestParticipantsTable)
        .where(
          and(
            eq(sharedQuestParticipantsTable.questId, questId),
            inArray(sharedQuestParticipantsTable.status, ["active", "invited", "completed"]),
          ),
        );
      for (const peer of peers) {
        if (peer.userId === completed.userId) continue;
        await addQuestNotification(tx, {
          questId,
          recipientUserId: peer.userId,
          actorUserId: completed.userId,
          type: "participant_completed",
        });
      }
    });
  }

  const [completedCount] = await db
    .select({ total: count() })
    .from(sharedQuestParticipantsTable)
    .where(
      and(
        eq(sharedQuestParticipantsTable.questId, questId),
        eq(sharedQuestParticipantsTable.status, "completed"),
      ),
    );
  if (Number(completedCount?.total ?? 0) < quest.targetCount) return;

  await db.transaction(async (tx) => {
    const [completedQuest] = await tx
      .update(sharedQuestsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(
        and(
          eq(sharedQuestsTable.id, questId),
          eq(sharedQuestsTable.status, "active"),
        ),
      )
      .returning({ ownerUserId: sharedQuestsTable.ownerUserId });
    if (!completedQuest) return;
    const participants = await tx
      .select({ userId: sharedQuestParticipantsTable.userId })
      .from(sharedQuestParticipantsTable)
      .where(
        and(
          eq(sharedQuestParticipantsTable.questId, questId),
          inArray(sharedQuestParticipantsTable.status, ["active", "invited", "completed"]),
        ),
      );
    for (const participant of participants) {
      await addQuestNotification(tx, {
        questId,
        recipientUserId: participant.userId,
        actorUserId: completedQuest.ownerUserId,
        type: "quest_completed",
      });
    }
  });
}

async function socialQuestResponse(questId: number, viewerId: number) {
  const quest = await db.query.sharedQuestsTable.findFirst({
    where: and(
      eq(sharedQuestsTable.id, questId),
      eq(sharedQuestsTable.kind, "social"),
    ),
  });
  if (!quest || !quest.experienceId) return null;
  const [experience, rows] = await Promise.all([
    db.query.experiencesTable.findFirst({
      where: eq(experiencesTable.id, quest.experienceId),
    }),
    db
      .select({ participant: sharedQuestParticipantsTable, user: usersTable })
      .from(sharedQuestParticipantsTable)
      .innerJoin(usersTable, eq(usersTable.id, sharedQuestParticipantsTable.userId))
      .where(eq(sharedQuestParticipantsTable.questId, questId)),
  ]);
  if (!experience) return null;
  return {
    id: quest.id,
    kind: "social" as const,
    title: quest.title,
    status: quest.status,
    targetCount: quest.targetCount,
    progress: rows.filter(({ participant }) => participant.status === "completed").length,
    owner: participantSummary(
      rows.find(({ participant }) => participant.userId === quest.ownerUserId)?.user
        ?? (await db.query.usersTable.findFirst({ where: eq(usersTable.id, quest.ownerUserId) }))!,
    ),
    canManage: quest.ownerUserId === viewerId,
    experience: {
      id: experience.id,
      title: experience.title,
      date: experience.date,
      city: experience.city,
    },
    participants: rows.map(({ participant, user }) => ({
      ...participantSummary(user),
      status: participant.status,
      invitedAt: participant.createdAt.toISOString(),
      acceptedAt: participant.acceptedAt?.toISOString() ?? null,
      completedAt: participant.completedAt?.toISOString() ?? null,
      rewardGrantedAt: participant.rewardGrantedAt?.toISOString() ?? null,
      isViewer: participant.userId === viewerId,
      recognition: participant.rewardGrantedAt ? "Verified completion" : null,
    })),
    createdAt: quest.createdAt.toISOString(),
    completedAt: quest.completedAt?.toISOString() ?? null,
  };
}

async function canViewSocialQuest(questId: number, viewerId: number) {
  const quest = await db.query.sharedQuestsTable.findFirst({
    where: and(
      eq(sharedQuestsTable.id, questId),
      eq(sharedQuestsTable.kind, "social"),
    ),
    columns: { ownerUserId: true },
  });
  if (!quest) return false;
  if (quest.ownerUserId === viewerId) return true;
  const membership = await db.query.sharedQuestParticipantsTable.findFirst({
    where: and(
      eq(sharedQuestParticipantsTable.questId, questId),
      eq(sharedQuestParticipantsTable.userId, viewerId),
    ),
    columns: { id: true },
  });
  if (!membership) return false;
  const relation = await relationshipStatus(quest.ownerUserId, viewerId);
  return canViewSocialQuestRule({
    ownerId: quest.ownerUserId,
    viewerId,
    isParticipant: true,
    ...relation,
  });
}

async function getCommunityProgress(questId: number) {
  const quest = await db.query.sharedQuestsTable.findFirst({
    where: and(
      eq(sharedQuestsTable.id, questId),
      eq(sharedQuestsTable.kind, "community"),
    ),
  });
  if (!quest?.chatId) return null;
  const participants = await db
    .select({ participant: sharedQuestParticipantsTable, user: usersTable })
    .from(sharedQuestParticipantsTable)
    .innerJoin(usersTable, eq(usersTable.id, sharedQuestParticipantsTable.userId))
    .where(eq(sharedQuestParticipantsTable.questId, questId));
  const contributionRows = participants.length
    ? await db
        .select({
          userId: communityContributionsTable.userId,
          total: count(),
        })
        .from(communityContributionsTable)
        .where(
          and(
            eq(communityContributionsTable.chatId, quest.chatId),
            inArray(
              communityContributionsTable.userId,
              participants.map(({ participant }) => participant.userId),
            ),
            eq(communityContributionsTable.contributionType, "telegram_message"),
            eq(communityContributionsTable.qualificationReason, "qualified"),
            gt(communityContributionsTable.xpAwarded, 0),
            gte(communityContributionsTable.createdAt, quest.createdAt),
          ),
        )
        .groupBy(communityContributionsTable.userId)
    : [];
  const counts = new Map(contributionRows.map((row) => [row.userId, Number(row.total)]));
  return { quest, participants, counts };
}

async function reconcileCommunityMission(questId: number) {
  const progress = await getCommunityProgress(questId);
  if (!progress || progress.quest.status !== "active") return;
  const total = [...progress.counts.values()].reduce((sum, value) => sum + value, 0);
  if (
    !shouldCompleteCommunityMission({
      status: progress.quest.status,
      progress: total,
      targetCount: progress.quest.targetCount,
    })
  ) {
    return;
  }

  await db.transaction(async (tx) => {
    const [completedQuest] = await tx
      .update(sharedQuestsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(
        and(
          eq(sharedQuestsTable.id, questId),
          eq(sharedQuestsTable.status, "active"),
        ),
      )
      .returning({ ownerUserId: sharedQuestsTable.ownerUserId });
    if (!completedQuest) return;

    for (const { participant } of progress.participants) {
      const contributionCount = progress.counts.get(participant.userId) ?? 0;
      if (
        !canGrantCompletionRecognition({
          participantStatus: participant.status,
          rewardGrantedAt: participant.rewardGrantedAt,
        }) ||
        contributionCount === 0
      ) continue;
      const [rewarded] = await tx
        .update(sharedQuestParticipantsTable)
        .set({
          status: "completed",
          completedAt: new Date(),
          rewardGrantedAt: new Date(),
        })
        .where(
          and(
            eq(sharedQuestParticipantsTable.id, participant.id),
            eq(sharedQuestParticipantsTable.status, "active"),
            isNull(sharedQuestParticipantsTable.rewardGrantedAt),
          ),
        )
        .returning({ userId: sharedQuestParticipantsTable.userId });
      if (!rewarded) continue;
      await addQuestNotification(tx, {
        questId,
        recipientUserId: rewarded.userId,
        actorUserId: completedQuest.ownerUserId,
        type: "reward_granted",
      });
    }
    for (const { participant } of progress.participants) {
      await addQuestNotification(tx, {
        questId,
        recipientUserId: participant.userId,
        actorUserId: completedQuest.ownerUserId,
        type: "quest_completed",
      });
    }
  });
}

async function communityMissionResponse(questId: number, viewerId: number) {
  const progress = await getCommunityProgress(questId);
  if (!progress?.quest.chatId) return null;
  const { quest, participants, counts } = progress;
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const viewer = participants.find(({ participant }) => participant.userId === viewerId);
  return {
    id: quest.id,
    kind: "community" as const,
    title: quest.title,
    chatId: quest.chatId,
    status: quest.status,
    targetCount: quest.targetCount,
    progress: total,
    owner: participantSummary(
      participants.find(({ participant }) => participant.userId === quest.ownerUserId)?.user
        ?? (await db.query.usersTable.findFirst({ where: eq(usersTable.id, quest.ownerUserId) }))!,
    ),
    joined: Boolean(viewer && viewer.participant.status !== "declined"),
    canJoin: quest.status === "active" && !viewer,
    recognition: viewer?.participant.rewardGrantedAt
      ? "Mission completion recognition"
      : null,
    participants: participants.map(({ participant, user }) => ({
      ...participantSummary(user),
      status: participant.status,
      contributionCount: counts.get(participant.userId) ?? 0,
      completedAt: participant.completedAt?.toISOString() ?? null,
      rewardGrantedAt: participant.rewardGrantedAt?.toISOString() ?? null,
      isViewer: participant.userId === viewerId,
      recognition: participant.rewardGrantedAt ? "Mission completion recognition" : null,
    })),
    createdAt: quest.createdAt.toISOString(),
    completedAt: quest.completedAt?.toISOString() ?? null,
  };
}

router.get("/social", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;
  const memberships = await db
    .select({ questId: sharedQuestParticipantsTable.questId })
    .from(sharedQuestParticipantsTable)
    .innerJoin(sharedQuestsTable, eq(sharedQuestsTable.id, sharedQuestParticipantsTable.questId))
    .where(
      and(
        eq(sharedQuestParticipantsTable.userId, user.id),
        eq(sharedQuestsTable.kind, "social"),
      ),
    )
    .orderBy(desc(sharedQuestsTable.createdAt))
    .limit(50);
  const responses = [];
  for (const { questId } of memberships) {
    if (!(await canViewSocialQuest(questId, user.id))) continue;
    await reconcileSocialQuest(questId);
    const response = await socialQuestResponse(questId, user.id);
    if (response) responses.push(response);
  }
  res.json(responses);
});

router.post("/social", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;

  const parsed = CreateSocialQuestBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Add a title, open experience, one to eight invitees, and a valid verified-participant target.");
    return;
  }
  const title = parsed.data.title.trim();
  const experienceId = parsed.data.experienceId;
  const invitedIds = parsed.data.participantIds;
  const targetCount = parsed.data.targetCount;
  if (
    !title ||
    [...title].length > 100 ||
    invitedIds.length > SOCIAL_QUEST_INVITEE_LIMIT ||
    new Set(invitedIds).size !== invitedIds.length ||
    invitedIds.includes(user.id) ||
    targetCount < 2 ||
    targetCount > invitedIds.length + 1
  ) {
    sendError(
      res,
      400,
      "Add a title, an open experience, one to eight distinct friends, and a valid verified-participant target.",
    );
    return;
  }

  const experience = await db.query.experiencesTable.findFirst({
    where: eq(experiencesTable.id, experienceId),
  });
  if (!experience || !["published", "full"].includes(experience.status)) {
    sendError(res, 409, "Social quests require a currently open experience.");
    return;
  }
  const invitees = await db.query.usersTable.findMany({
    where: inArray(usersTable.id, invitedIds),
  });
  if (invitees.length !== invitedIds.length) {
    sendError(res, 404, "One or more invited profiles could not be found.");
    return;
  }
  for (const invitee of invitees) {
    const relation = await relationshipStatus(user.id, invitee.id);
    if (
      !canInviteToSocialQuest({
        ownerId: user.id,
        invitedUserId: invitee.id,
        ownerType: user.userType,
        invitedUserType: invitee.userType,
        ...relation,
      })
    ) {
      sendError(res, 409, "Every invitee must be an accepted participant friend or active accountability partner.");
      return;
    }
  }

  const questId = await db.transaction(async (tx) => {
    const [quest] = await tx
      .insert(sharedQuestsTable)
      .values({
        kind: "social",
        ownerUserId: user.id,
        experienceId,
        title,
        targetCount,
      })
      .returning({ id: sharedQuestsTable.id });
    if (!quest) return null;
    await tx.insert(sharedQuestParticipantsTable).values([
      {
        questId: quest.id,
        userId: user.id,
        status: "active",
        acceptedAt: new Date(),
      },
      ...invitees.map((invitee) => ({
        questId: quest.id,
        userId: invitee.id,
        status: "invited" as const,
      })),
    ]);
    for (const invitee of invitees) {
      await addQuestNotification(tx, {
        questId: quest.id,
        recipientUserId: invitee.id,
        actorUserId: user.id,
        type: "invitation",
      });
    }
    return quest.id;
  });
  if (!questId) {
    sendError(res, 500, "We couldn't create that social quest. Please try again.");
    return;
  }
  const response = await socialQuestResponse(questId, user.id);
  if (!response) {
    sendError(res, 500, "We couldn't load the new social quest.");
    return;
  }
  res.status(201).json(response);
});

router.post("/social/:questId/accept", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;
  const questId = parseId(req.params.questId);
  if (!questId) {
    sendError(res, 400, "Invalid social quest.");
    return;
  }
  const quest = await db.query.sharedQuestsTable.findFirst({
    where: and(
      eq(sharedQuestsTable.id, questId),
      eq(sharedQuestsTable.kind, "social"),
    ),
  });
  const participant = await db.query.sharedQuestParticipantsTable.findFirst({
    where: and(
      eq(sharedQuestParticipantsTable.questId, questId),
      eq(sharedQuestParticipantsTable.userId, user.id),
    ),
  });
  if (!quest || !participant) {
    sendError(res, 404, "Social quest invitation not found.");
    return;
  }
  const relation = await relationshipStatus(quest.ownerUserId, user.id);
  if (
    !canJoinSocialQuest({
      questStatus: quest.status,
      participantStatus: participant.status,
      ...relation,
    })
  ) {
    sendError(res, 409, "This invitation is no longer available or its relationship is no longer active.");
    return;
  }
  const [accepted] = await db
    .update(sharedQuestParticipantsTable)
    .set({ status: "active", acceptedAt: new Date() })
    .where(
      and(
        eq(sharedQuestParticipantsTable.id, participant.id),
        eq(sharedQuestParticipantsTable.status, "invited"),
      ),
    )
    .returning({ id: sharedQuestParticipantsTable.id });
  if (!accepted) {
    sendError(res, 409, "This invitation was updated. Refresh and try again.");
    return;
  }
  await reconcileSocialQuest(questId);
  const response = await socialQuestResponse(questId, user.id);
  if (!response) {
    sendError(res, 404, "Social quest not found.");
    return;
  }
  res.json(response);
});

router.post("/social/:questId/decline", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;
  const questId = parseId(req.params.questId);
  if (!questId) {
    sendError(res, 400, "Invalid social quest.");
    return;
  }
  const [declined] = await db
    .update(sharedQuestParticipantsTable)
    .set({ status: "declined" })
    .where(
      and(
        eq(sharedQuestParticipantsTable.questId, questId),
        eq(sharedQuestParticipantsTable.userId, user.id),
        eq(sharedQuestParticipantsTable.status, "invited"),
      ),
    )
    .returning({ id: sharedQuestParticipantsTable.id });
  if (!declined) {
    sendError(res, 404, "Social quest invitation not found.");
    return;
  }
  res.json({ id: questId, status: "declined" });
});

router.get("/community", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;
  const membershipRows = await db
    .selectDistinct({ chatId: communityContributionsTable.chatId })
    .from(communityContributionsTable)
    .where(
      and(
        eq(communityContributionsTable.userId, user.id),
        eq(communityContributionsTable.contributionType, "telegram_message"),
        eq(communityContributionsTable.qualificationReason, "qualified"),
        gt(communityContributionsTable.xpAwarded, 0),
      ),
    );
  const chatIds = membershipRows.map(({ chatId }) => chatId);
  if (!chatIds.length) {
    res.json([]);
    return;
  }
  const quests = await db
    .select({ id: sharedQuestsTable.id })
    .from(sharedQuestsTable)
    .where(
      and(
        eq(sharedQuestsTable.kind, "community"),
        inArray(sharedQuestsTable.chatId, chatIds),
      ),
    )
    .orderBy(desc(sharedQuestsTable.createdAt))
    .limit(50);
  const responses = [];
  for (const { id } of quests) {
    await reconcileCommunityMission(id);
    const response = await communityMissionResponse(id, user.id);
    if (response) responses.push(response);
  }
  res.json(responses);
});

router.post("/community", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;
  const parsed = CreateCommunityMissionBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Enter a valid title, Telegram group, and target between 1 and 500.");
    return;
  }
  const title = parsed.data.title.trim();
  const chatId = parsed.data.chatId.trim();
  const targetCount = parsed.data.targetCount;
  if (
    !title ||
    [...title].length > 100 ||
    targetCount > COMMUNITY_MISSION_TARGET_LIMIT
  ) {
    sendError(res, 400, "Enter a title, a valid Telegram group, and a target between 1 and 500.");
    return;
  }
  const telegramId = String(user.telegramId ?? "");
  if (!/^[1-9]\d{0,19}$/.test(telegramId)) {
    sendError(res, 403, "A linked Telegram identity is required to start a community mission.");
    return;
  }
  if (!(await hasCommunityContribution(user.id, chatId))) {
    sendError(res, 403, "You must have a recorded qualifying contribution in that group.");
    return;
  }
  const questId = await db.transaction(async (tx) => {
    const [quest] = await tx
      .insert(sharedQuestsTable)
      .values({
        kind: "community",
        ownerUserId: user.id,
        chatId,
        title,
        targetCount,
      })
      .returning({ id: sharedQuestsTable.id });
    if (!quest) return null;
    await tx.insert(sharedQuestParticipantsTable).values({
      questId: quest.id,
      userId: user.id,
      status: "active",
      acceptedAt: new Date(),
    });
    return quest.id;
  });
  if (!questId) {
    sendError(res, 500, "We couldn't create that community mission. Please try again.");
    return;
  }
  const response = await communityMissionResponse(questId, user.id);
  if (!response) {
    sendError(res, 500, "We couldn't load the new community mission.");
    return;
  }
  res.status(201).json(response);
});

router.post("/community/:questId/join", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;
  const questId = parseId(req.params.questId);
  if (!questId) {
    sendError(res, 400, "Invalid community mission.");
    return;
  }
  const quest = await db.query.sharedQuestsTable.findFirst({
    where: and(
      eq(sharedQuestsTable.id, questId),
      eq(sharedQuestsTable.kind, "community"),
    ),
  });
  if (!quest || !quest.chatId) {
    sendError(res, 404, "Community mission not found.");
    return;
  }
  if (quest.status !== "active") {
    sendError(res, 409, "This community mission is no longer open.");
    return;
  }
  if (!(await hasCommunityContribution(user.id, quest.chatId))) {
    sendError(res, 403, "Only members with a recorded qualifying contribution can join.");
    return;
  }
  await db
    .insert(sharedQuestParticipantsTable)
    .values({
      questId,
      userId: user.id,
      status: "active",
      acceptedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [sharedQuestParticipantsTable.questId, sharedQuestParticipantsTable.userId],
    });
  const participant = await db.query.sharedQuestParticipantsTable.findFirst({
    where: and(
      eq(sharedQuestParticipantsTable.questId, questId),
      eq(sharedQuestParticipantsTable.userId, user.id),
    ),
  });
  if (participant?.status === "declined") {
    sendError(res, 409, "You declined this mission and cannot rejoin it.");
    return;
  }
  await reconcileCommunityMission(questId);
  const response = await communityMissionResponse(questId, user.id);
  if (!response) {
    sendError(res, 404, "Community mission not found.");
    return;
  }
  res.json(response);
});

router.get("/notifications", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;
  const rows = await db
    .select({
      notification: sharedQuestNotificationsTable,
      quest: sharedQuestsTable,
      actor: usersTable,
    })
    .from(sharedQuestNotificationsTable)
    .innerJoin(sharedQuestsTable, eq(sharedQuestsTable.id, sharedQuestNotificationsTable.questId))
    .innerJoin(usersTable, eq(usersTable.id, sharedQuestNotificationsTable.actorUserId))
    .where(eq(sharedQuestNotificationsTable.recipientUserId, user.id))
    .orderBy(desc(sharedQuestNotificationsTable.createdAt))
    .limit(50);
  const visible = [];
  for (const { notification, quest, actor } of rows) {
    if (
      quest.kind === "social" &&
      !(await canViewSocialQuest(quest.id, user.id))
    ) {
      continue;
    }
    visible.push({
      id: notification.id,
      questId: quest.id,
      questKind: quest.kind,
      questTitle: quest.title,
      actor: participantSummary(actor),
      type: notification.type,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    });
  }
  res.json(visible);
});

router.patch("/notifications/:notificationId/read", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipant(user, res) || !(await requireSchema(res))) return;
  const notificationId = parseId(req.params.notificationId);
  if (!notificationId) {
    sendError(res, 400, "Invalid notification.");
    return;
  }
  const [updated] = await db
    .update(sharedQuestNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(sharedQuestNotificationsTable.id, notificationId),
        eq(sharedQuestNotificationsTable.recipientUserId, user.id),
      ),
    )
    .returning({ id: sharedQuestNotificationsTable.id });
  if (!updated) {
    sendError(res, 404, "Notification not found.");
    return;
  }
  res.json({ id: updated.id, read: true });
});

export default router;
