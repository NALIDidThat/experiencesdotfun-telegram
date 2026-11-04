import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateFeedCommentBody,
  CreateFeedCommentParams,
  CreateFeedPostBody,
  DeleteFeedCommentParams,
  GetFeedItemParams,
  GetFeedQueryParams,
  RegisterFeedPushTokenBody,
  ReportFeedPostBody,
  ListFeedCommentsParams,
  RemoveFeedReactionParams,
  SetFeedReactionBody,
  SetFeedReactionParams,
  UpdateFeedPreferencesBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  commentsTable,
  feedActivityEventsTable,
  feedNotificationsTable,
  feedPreferencesTable,
  feedPushTokensTable,
  feedPostReportsTable,
  friendshipsTable,
  experiencesTable,
  organisationsTable,
  postReactionsTable,
  postsTable,
  communityMembersTable,
  telegramCommunitiesTable,
  usersTable,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { canCreateFeedComment, canCreateFeedPost, isSelfReportedAccountabilityEvent } from "../lib/feed-policy";
import { sendTelegramCommunityUpdate } from "../lib/telegram";
import { sendCommunityUpdatePushes } from "../lib/expo-push";

const router: IRouter = Router();
const PAGE_LIMIT_DEFAULT = 20;
let communityFeedSchemaPromise: Promise<boolean> | undefined;
const automaticActivityTypes = [
  "experience_joined",
  "experience_verified",
  "xp_earned",
  "achievement_unlocked",
  "accountability_checkin",
  "accountability_goal_completed",
] as const;

type FeedMode = "for-you" | "following" | "local";
type Cursor = { rank: number; createdAt: string; id: number };

function error(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

async function ensureCommunityFeedSchema(res: Response): Promise<boolean> {
  try {
    communityFeedSchemaPromise ??= db
      .execute(sql`
        SELECT
          to_regclass('public.feed_notifications') IS NOT NULL AS notifications_table,
          to_regclass('public.feed_post_reports') IS NOT NULL AS reports_table,
          to_regclass('public.feed_push_tokens') IS NOT NULL AS push_tokens_table
      `)
      .then((result) => {
        const row = result.rows[0] as {
          notifications_table?: boolean;
          reports_table?: boolean;
          push_tokens_table?: boolean;
        } | undefined;
        return Boolean(
          row?.notifications_table &&
          row?.reports_table &&
          row?.push_tokens_table,
        );
      });
    if (await communityFeedSchemaPromise) return true;
    communityFeedSchemaPromise = undefined;
  } catch {
    communityFeedSchemaPromise = undefined;
  }
  error(res, 503, "Community feed notifications, reporting, and push settings are unavailable until the database migration is applied.");
  return false;
}

function parsePositiveId(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("rank" in parsed) ||
      !("createdAt" in parsed) ||
      !("id" in parsed) ||
      typeof parsed.rank !== "number" ||
      !Number.isInteger(parsed.rank) ||
      parsed.rank < 1 ||
      parsed.rank > 3 ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "number" ||
      !Number.isSafeInteger(parsed.id) ||
      parsed.id < 1
    ) {
      return undefined;
    }
    return { rank: parsed.rank, createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return undefined;
  }
}

async function getAcceptedFriendIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({
      requesterId: friendshipsTable.requesterUserId,
      recipientId: friendshipsTable.recipientUserId,
    })
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.status, "accepted"),
        or(
          eq(friendshipsTable.requesterUserId, userId),
          eq(friendshipsTable.recipientUserId, userId),
        ),
      ),
    );
  return rows.map((row) =>
    row.requesterId === userId ? row.recipientId : row.requesterId,
  );
}

async function getCommunityChatIds(userId: number): Promise<string[]> {
  const [memberships, profile] = await Promise.all([
    db
      .select({ chatId: communityMembersTable.chatId })
      .from(communityMembersTable)
      .where(eq(communityMembersTable.userId, userId)),
    db
      .select({ userType: usersTable.userType })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1),
  ]);
  const managedCommunities = profile[0]?.userType === "organisation"
    ? await db
        .select({ chatId: telegramCommunitiesTable.chatId })
        .from(telegramCommunitiesTable)
        .where(eq(telegramCommunitiesTable.connectedByUserId, userId))
    : [];
  return [...new Set([
    ...memberships.map((row) => row.chatId),
    ...managedCommunities.map((row) => row.chatId),
  ])];
}

function visibleToViewer(
  viewerId: number,
  friendIds: number[],
  communityChatIds: string[] = [],
): SQL {
  const predicates: SQL[] = [
    eq(feedActivityEventsTable.visibility, "public"),
    and(
      eq(feedActivityEventsTable.visibility, "friends"),
      inArray(feedActivityEventsTable.actorId, friendIds),
    )!,
    and(
      eq(feedActivityEventsTable.visibility, "private"),
      eq(feedActivityEventsTable.actorId, viewerId),
    )!,
  ];
  if (communityChatIds.length > 0) {
    predicates.push(
      and(
        eq(feedActivityEventsTable.visibility, "community"),
        inArray(
          sql<string>`${feedActivityEventsTable.metadata}->>'communityChatId'`,
          communityChatIds,
        ),
      )!,
    );
  }
  return or(
    ...predicates,
  )!;
}

function localToCity(city: string | null | undefined): SQL {
  if (!city?.trim()) return sql`false`;
  const normalizedCity = city.trim();
  return or(
    sql`LOWER(COALESCE(${usersTable.city}, '')) = LOWER(${normalizedCity})`,
    sql`LOWER(COALESCE(${experiencesTable.city}, '')) = LOWER(${normalizedCity})`,
  )!;
}

function isFriendActor(actorId: number, friendIds: Set<number>): boolean {
  return friendIds.has(actorId);
}

function summaryForEvent(
  type: string,
  experienceTitle: string | null,
  metadata: Record<string, unknown>,
): string {
  if (isSelfReportedAccountabilityEvent(type)) {
    return type === "accountability_checkin"
      ? "reported checking in on a goal"
      : "reported completing a personal goal";
  }
  switch (type) {
    case "experience_published":
      return "published a new experience";
    case "experience_joined":
      return "joined an experience";
    case "experience_verified":
      return "completed and verified an experience";
    case "xp_earned": {
      const amount = Number(metadata.amount);
      return Number.isFinite(amount) && amount > 0
        ? `earned ${amount} XP`
        : "earned XP";
    }
    case "achievement_unlocked":
      return `unlocked ${typeof metadata.title === "string" ? metadata.title : "a milestone"}`;
    default:
      return experienceTitle ? `shared ${experienceTitle}` : "shared an update";
  }
}

function itemFromRow(
  row: {
    event: typeof feedActivityEventsTable.$inferSelect;
    actor: typeof usersTable.$inferSelect;
    post: typeof postsTable.$inferSelect | null;
    experienceId: number | null;
    experienceTitle: string | null;
    experienceCategory: string | null;
    experienceDate: string | null;
    experienceStartTime: string | null;
    experienceEndTime: string | null;
    experienceCity: string | null;
    experienceLocation: string | null;
    experienceXpReward: number | null;
    organisationName: string | null;
  },
  viewerId: number,
  friendIds: Set<number>,
  reactionCount: number,
  commentCount: number,
  viewerReactionType: string | null,
) {
  const metadata =
    row.event.metadata && typeof row.event.metadata === "object"
      ? row.event.metadata
      : {};
  const experience =
    row.experienceId !== null &&
    row.experienceTitle !== null &&
    row.experienceCategory !== null &&
    row.experienceDate !== null &&
    row.experienceStartTime !== null &&
    row.experienceEndTime !== null &&
    row.experienceCity !== null &&
    row.experienceLocation !== null &&
    row.experienceXpReward !== null
      ? {
          id: row.experienceId,
          title: row.experienceTitle,
          category: row.experienceCategory,
          date: row.experienceDate,
          startTime: row.experienceStartTime,
          endTime: row.experienceEndTime,
          city: row.experienceCity,
          location: row.experienceLocation,
          xpReward: row.experienceXpReward,
          organisationName: row.organisationName ?? "Community organisation",
        }
      : null;
  const post =
    row.post === null
      ? null
      : { id: row.post.id, kind: row.post.kind, body: row.post.body };
  const xpAmount =
    typeof metadata.amount === "number" && metadata.amount > 0
      ? metadata.amount
      : null;

  return {
    id: row.event.id,
    type: row.event.type,
    actor: {
      id: row.actor.id,
      name: row.actor.name,
      username: row.actor.username,
      avatarUrl: row.actor.avatarUrl,
      city:
        row.actor.id === viewerId || friendIds.has(row.actor.id)
          ? row.actor.city
          : null,
      userType: row.actor.userType,
      isFriend: isFriendActor(row.actor.id, friendIds),
    },
    createdAt: row.event.createdAt,
    visibility: row.event.visibility,
    communityChatId:
      typeof metadata.communityChatId === "string" ? metadata.communityChatId : null,
    experience,
    post,
    xpAmount,
    sourceTitle:
      typeof metadata.sourceTitle === "string" ? metadata.sourceTitle : null,
    summary: summaryForEvent(row.event.type, row.experienceTitle, metadata),
    reaction: {
      count: reactionCount,
      reacted: viewerReactionType !== null,
      reactionType: viewerReactionType,
    },
    commentCount,
  };
}

function itemQuery(
  viewerId: number,
  friendIds: number[],
  communityChatIds: string[],
  activityId?: number,
  communityChatId?: string,
  cursor?: Cursor,
) {
  const filters: SQL[] = [
    visibleToViewer(
      viewerId,
      [...new Set([viewerId, ...friendIds])],
      communityChatIds,
    ),
  ];
  if (activityId !== undefined) {
    filters.push(eq(feedActivityEventsTable.id, activityId));
  }
  if (communityChatId !== undefined) {
    filters.push(
      and(
        eq(feedActivityEventsTable.visibility, "community"),
        eq(feedActivityEventsTable.type, "status_posted"),
        eq(feedActivityEventsTable.targetType, "post"),
        sql`${feedActivityEventsTable.metadata}->>'communityChatId' = ${communityChatId}`,
      )!,
    );
  }
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    filters.push(
      or(
        lt(feedActivityEventsTable.createdAt, cursorDate),
        and(
          eq(feedActivityEventsTable.createdAt, cursorDate),
          lt(feedActivityEventsTable.id, cursor.id),
        ),
      )!,
    );
  }
  return db
    .select({
      event: feedActivityEventsTable,
      actor: usersTable,
      post: postsTable,
      experienceId: experiencesTable.id,
      experienceTitle: experiencesTable.title,
      experienceCategory: experiencesTable.category,
      experienceDate: experiencesTable.date,
      experienceStartTime: experiencesTable.startTime,
      experienceEndTime: experiencesTable.endTime,
      experienceCity: experiencesTable.city,
      experienceLocation: experiencesTable.location,
      experienceXpReward: experiencesTable.xpReward,
      organisationName: organisationsTable.name,
    })
    .from(feedActivityEventsTable)
    .innerJoin(usersTable, eq(usersTable.id, feedActivityEventsTable.actorId))
    .leftJoin(
      postsTable,
      and(
        eq(postsTable.id, feedActivityEventsTable.targetId),
        eq(feedActivityEventsTable.targetType, "post"),
      ),
    )
    .leftJoin(
      experiencesTable,
      and(
        eq(experiencesTable.id, feedActivityEventsTable.targetId),
        eq(feedActivityEventsTable.targetType, "experience"),
      ),
    )
    .leftJoin(
      organisationsTable,
      eq(organisationsTable.id, experiencesTable.organisationId),
    )
    .where(and(...filters));
}

async function getFeedItemRow(activityId: number, viewerId: number) {
  const [friendIds, communityChatIds] = await Promise.all([
    getAcceptedFriendIds(viewerId),
    getCommunityChatIds(viewerId),
  ]);
  const [row] = await itemQuery(viewerId, friendIds, communityChatIds, activityId).limit(1);
  return { row, friendIds, communityChatIds };
}

async function reactionState(activityId: number, viewerId: number) {
  const [counts, own] = await Promise.all([
    db
      .select({ value: count() })
      .from(postReactionsTable)
      .where(eq(postReactionsTable.activityId, activityId)),
    db
      .select({ reactionType: postReactionsTable.reactionType })
      .from(postReactionsTable)
      .where(
        and(
          eq(postReactionsTable.activityId, activityId),
          eq(postReactionsTable.userId, viewerId),
        ),
      )
      .limit(1),
  ]);
  return {
    count: Number(counts[0]?.value ?? 0),
    reacted: Boolean(own[0]),
    reactionType: own[0]?.reactionType ?? null,
  };
}

router.get("/feed", requireTelegramUser, async (req, res) => {
  const parsed = GetFeedQueryParams.safeParse({
    mode: typeof req.query.mode === "string" ? req.query.mode : undefined,
    cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
    limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
  });
  if (!parsed.success) {
    error(res, 400, "Choose a valid feed mode and page size.");
    return;
  }

  const cursor = decodeCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursor) {
    error(res, 400, "This feed cursor is invalid. Refresh the feed to continue.");
    return;
  }

  const user = currentUser(req);
  const mode = parsed.data.mode as FeedMode;
  const limit = parsed.data.limit ?? PAGE_LIMIT_DEFAULT;
  const [friendIds, communityChatIds] = await Promise.all([
    getAcceptedFriendIds(user.id),
    getCommunityChatIds(user.id),
  ]);
  const visibleActorIds = [...new Set([user.id, ...friendIds])];
  const localPredicate = localToCity(user.city);
  const friendRankPredicate = inArray(feedActivityEventsTable.actorId, visibleActorIds);
  const rankExpression = sql<number>`CASE
    WHEN ${friendRankPredicate} THEN 3
    WHEN ${localPredicate} THEN 2
    ELSE 1
  END`;
  const filters = [visibleToViewer(user.id, visibleActorIds, communityChatIds)];

  if (mode === "following") {
    filters.push(inArray(feedActivityEventsTable.actorId, visibleActorIds));
  } else if (mode === "local") {
    filters.push(localPredicate);
  }

  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    filters.push(
      or(
        sql`${rankExpression} < ${cursor.rank}`,
        and(
          eq(rankExpression, cursor.rank),
          lt(feedActivityEventsTable.createdAt, cursorDate),
        ),
        and(
          eq(rankExpression, cursor.rank),
          eq(feedActivityEventsTable.createdAt, cursorDate),
          lt(feedActivityEventsTable.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select({
      event: feedActivityEventsTable,
      actor: usersTable,
      post: postsTable,
      experienceId: experiencesTable.id,
      experienceTitle: experiencesTable.title,
      experienceCategory: experiencesTable.category,
      experienceDate: experiencesTable.date,
      experienceStartTime: experiencesTable.startTime,
      experienceEndTime: experiencesTable.endTime,
      experienceCity: experiencesTable.city,
      experienceLocation: experiencesTable.location,
      experienceXpReward: experiencesTable.xpReward,
      organisationName: organisationsTable.name,
      rank: rankExpression,
    })
    .from(feedActivityEventsTable)
    .innerJoin(usersTable, eq(usersTable.id, feedActivityEventsTable.actorId))
    .leftJoin(
      postsTable,
      and(
        eq(postsTable.id, feedActivityEventsTable.targetId),
        eq(feedActivityEventsTable.targetType, "post"),
      ),
    )
    .leftJoin(
      experiencesTable,
      and(
        eq(experiencesTable.id, feedActivityEventsTable.targetId),
        eq(feedActivityEventsTable.targetType, "experience"),
      ),
    )
    .leftJoin(
      organisationsTable,
      eq(organisationsTable.id, experiencesTable.organisationId),
    )
    .where(and(...filters))
    .orderBy(desc(rankExpression), desc(feedActivityEventsTable.createdAt), desc(feedActivityEventsTable.id))
    .limit(limit + 1);

  const pageRows = rows.slice(0, limit);
  const activityIds = pageRows.map((row) => row.event.id);
  const [reactionCounts, commentCounts, viewerReactions] = activityIds.length
    ? await Promise.all([
        db
          .select({ activityId: postReactionsTable.activityId, value: count() })
          .from(postReactionsTable)
          .where(inArray(postReactionsTable.activityId, activityIds))
          .groupBy(postReactionsTable.activityId),
        db
          .select({ activityId: commentsTable.activityId, value: count() })
          .from(commentsTable)
          .where(inArray(commentsTable.activityId, activityIds))
          .groupBy(commentsTable.activityId),
        db
          .select({
            activityId: postReactionsTable.activityId,
            reactionType: postReactionsTable.reactionType,
          })
          .from(postReactionsTable)
          .where(
            and(
              inArray(postReactionsTable.activityId, activityIds),
              eq(postReactionsTable.userId, user.id),
            ),
          ),
      ])
    : [[], [], []];
  const reactionCountsById = new Map(
    reactionCounts.map((row) => [row.activityId, Number(row.value)]),
  );
  const commentCountsById = new Map(
    commentCounts.map((row) => [row.activityId, Number(row.value)]),
  );
  const viewerReactionsById = new Map(
    viewerReactions.map((row) => [row.activityId, row.reactionType]),
  );
  const friendIdSet = new Set(friendIds);
  const items = pageRows
    .filter((row) => row.event.type !== "status_posted" || row.post !== null)
    .map((row) =>
      itemFromRow(
        row,
        user.id,
        friendIdSet,
        reactionCountsById.get(row.event.id) ?? 0,
        commentCountsById.get(row.event.id) ?? 0,
        viewerReactionsById.get(row.event.id) ?? null,
      ),
    );
  const lastRow = pageRows.at(-1);

  res.json({
    items,
    nextCursor:
      rows.length > limit && lastRow
        ? encodeCursor({
            rank: Number(lastRow.rank),
            createdAt: lastRow.event.createdAt.toISOString(),
            id: lastRow.event.id,
          })
        : null,
    mode,
    city: user.city,
  });
});

router.get("/feed/notifications", requireTelegramUser, async (req, res) => {
  if (!(await ensureCommunityFeedSchema(res))) return;
  const user = currentUser(req);
  const rows = await db
    .select({
      notification: feedNotificationsTable,
      actor: usersTable,
      communityTitle: communityMembersTable.chatTitle,
      post: postsTable,
    })
    .from(feedNotificationsTable)
    .innerJoin(usersTable, eq(usersTable.id, feedNotificationsTable.actorUserId))
    .innerJoin(
      communityMembersTable,
      and(
        eq(communityMembersTable.chatId, feedNotificationsTable.communityChatId),
        eq(communityMembersTable.userId, feedNotificationsTable.recipientUserId),
      ),
    )
    .innerJoin(
      feedActivityEventsTable,
      eq(feedActivityEventsTable.id, feedNotificationsTable.activityId),
    )
    .innerJoin(
      postsTable,
      and(
        eq(postsTable.id, feedActivityEventsTable.targetId),
        eq(feedActivityEventsTable.targetType, "post"),
      ),
    )
    .where(eq(feedNotificationsTable.recipientUserId, user.id))
    .orderBy(desc(feedNotificationsTable.createdAt), desc(feedNotificationsTable.id))
    .limit(50);

  const notifications = rows.map(({ notification, actor, communityTitle, post }) => ({
    id: notification.id,
    activityId: notification.activityId,
    communityChatId: notification.communityChatId,
    communityTitle,
    title: "New community update",
    message: post.body,
    actor: {
      id: actor.id,
      name: actor.name,
      username: actor.username,
      avatarUrl: actor.avatarUrl,
      city: null,
      userType: actor.userType,
      isFriend: false,
    },
    isUnread: notification.readAt === null,
    createdAt: notification.createdAt,
  }));
  res.json({
    notifications,
    unreadCount: notifications.filter((notification) => notification.isUnread).length,
  });
});

router.patch("/feed/notifications/:notificationId/read", requireTelegramUser, async (req, res) => {
  if (!(await ensureCommunityFeedSchema(res))) return;
  const notificationId = parsePositiveId(req.params.notificationId);
  if (!notificationId) {
    error(res, 400, "Invalid notification.");
    return;
  }
  const user = currentUser(req);
  const [updated] = await db
    .update(feedNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(feedNotificationsTable.id, notificationId),
        eq(feedNotificationsTable.recipientUserId, user.id),
      ),
    )
    .returning({ id: feedNotificationsTable.id });
  if (!updated) {
    error(res, 404, "Notification not found.");
    return;
  }
  res.status(204).send();
});

router.get("/feed/push-settings", requireTelegramUser, async (req, res) => {
  if (!(await ensureCommunityFeedSchema(res))) return;
  const user = currentUser(req);
  const [enabledToken] = await db
    .select({ id: feedPushTokensTable.id })
    .from(feedPushTokensTable)
    .where(
      and(
        eq(feedPushTokensTable.userId, user.id),
        eq(feedPushTokensTable.enabled, true),
      ),
    )
    .limit(1);
  res.json({ enabled: Boolean(enabledToken) });
});

router.post("/feed/push-tokens", requireTelegramUser, async (req, res) => {
  if (!(await ensureCommunityFeedSchema(res))) return;
  const parsed = RegisterFeedPushTokenBody.safeParse(req.body);
  if (
    !parsed.success ||
    !/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(parsed.data.token)
  ) {
    error(res, 400, "Register a valid Expo push token for an iOS or Android device.");
    return;
  }
  const user = currentUser(req);
  const now = new Date();
  await db
    .insert(feedPushTokensTable)
    .values({
      userId: user.id,
      expoPushToken: parsed.data.token,
      platform: parsed.data.platform,
      enabled: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: feedPushTokensTable.expoPushToken,
      set: {
        userId: user.id,
        platform: parsed.data.platform,
        enabled: true,
        updatedAt: now,
      },
    });
  res.status(204).send();
});

router.delete("/feed/push-tokens", requireTelegramUser, async (req, res) => {
  if (!(await ensureCommunityFeedSchema(res))) return;
  const user = currentUser(req);
  await db
    .delete(feedPushTokensTable)
    .where(eq(feedPushTokensTable.userId, user.id));
  res.status(204).send();
});

router.get("/community/:chatId/feed", requireTelegramUser, async (req, res) => {
  const chatId = String(req.params.chatId);
  if (!/^-?\d{1,20}$/.test(chatId)) {
    error(res, 400, "That community identifier is invalid.");
    return;
  }
  const rawLimit = typeof req.query.limit === "string"
    ? Number(req.query.limit)
    : PAGE_LIMIT_DEFAULT;
  if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    error(res, 400, "Choose a community feed page size between 1 and 50.");
    return;
  }
  const cursorValue = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) {
    error(res, 400, "This community feed cursor is invalid. Refresh to continue.");
    return;
  }

  const user = currentUser(req);
  const [friendIds, memberChatIds, membershipRows, linkedGroup] = await Promise.all([
    getAcceptedFriendIds(user.id),
    getCommunityChatIds(user.id),
    db
      .select({ chatTitle: communityMembersTable.chatTitle })
      .from(communityMembersTable)
      .where(
        and(
          eq(communityMembersTable.chatId, chatId),
          eq(communityMembersTable.userId, user.id),
        ),
      )
      .limit(1),
    user.userType === "organisation"
      ? db
          .select({
            chatId: telegramCommunitiesTable.chatId,
            chatTitle: telegramCommunitiesTable.chatTitle,
          })
          .from(telegramCommunitiesTable)
          .where(
            and(
              eq(telegramCommunitiesTable.chatId, chatId),
              eq(telegramCommunitiesTable.connectedByUserId, user.id),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (!membershipRows.length && !linkedGroup.length) {
    error(res, 403, "Join and verify this Telegram community to see its updates.");
    return;
  }
  const community = {
    chatId,
    title: membershipRows[0]?.chatTitle ?? linkedGroup[0]?.chatTitle ?? "Community",
  };
  const communityChatIds = [...new Set([...memberChatIds, chatId])];
  const rows = await itemQuery(
    user.id,
    friendIds,
    communityChatIds,
    undefined,
    chatId,
    cursor,
  )
    .orderBy(desc(feedActivityEventsTable.createdAt), desc(feedActivityEventsTable.id))
    .limit(rawLimit + 1);
  const pageRows = rows.slice(0, rawLimit);
  const activityIds = pageRows.map((row) => row.event.id);
  const [reactions, comments, viewerReactions] = activityIds.length
    ? await Promise.all([
        db
          .select({ activityId: postReactionsTable.activityId, value: count() })
          .from(postReactionsTable)
          .where(inArray(postReactionsTable.activityId, activityIds))
          .groupBy(postReactionsTable.activityId),
        db
          .select({ activityId: commentsTable.activityId, value: count() })
          .from(commentsTable)
          .where(inArray(commentsTable.activityId, activityIds))
          .groupBy(commentsTable.activityId),
        db
          .select({
            activityId: postReactionsTable.activityId,
            reactionType: postReactionsTable.reactionType,
          })
          .from(postReactionsTable)
          .where(
            and(
              inArray(postReactionsTable.activityId, activityIds),
              eq(postReactionsTable.userId, user.id),
            ),
          ),
      ])
    : [[], [], []];
  const reactionCountById = new Map(reactions.map((row) => [row.activityId, Number(row.value)]));
  const commentCountById = new Map(comments.map((row) => [row.activityId, Number(row.value)]));
  const ownReactionById = new Map(viewerReactions.map((row) => [row.activityId, row.reactionType]));
  const friendIdSet = new Set(friendIds);
  const last = pageRows.at(-1);
  res.json({
    community,
    canBroadcastToTelegram: linkedGroup.length > 0,
    items: pageRows
      .filter((row) => row.post !== null)
      .map((row) =>
        itemFromRow(
          row,
          user.id,
          friendIdSet,
          reactionCountById.get(row.event.id) ?? 0,
          commentCountById.get(row.event.id) ?? 0,
          ownReactionById.get(row.event.id) ?? null,
        ),
      ),
    nextCursor:
      rows.length > rawLimit && last
        ? encodeCursor({
            rank: 1,
            createdAt: last.event.createdAt.toISOString(),
            id: last.event.id,
          })
        : null,
  });
});

router.get("/profiles/:profileId/posts", requireTelegramUser, async (req, res) => {
  const profileId = parsePositiveId(req.params.profileId);
  if (!profileId) {
    error(res, 400, "This profile identifier is invalid.");
    return;
  }

  const user = currentUser(req);
  const [friendIds, communityChatIds] = await Promise.all([
    getAcceptedFriendIds(user.id),
    getCommunityChatIds(user.id),
  ]);
  const rows = await db
    .select({
      event: feedActivityEventsTable,
      actor: usersTable,
      post: postsTable,
      experienceId: experiencesTable.id,
      experienceTitle: experiencesTable.title,
      experienceCategory: experiencesTable.category,
      experienceDate: experiencesTable.date,
      experienceStartTime: experiencesTable.startTime,
      experienceEndTime: experiencesTable.endTime,
      experienceCity: experiencesTable.city,
      experienceLocation: experiencesTable.location,
      experienceXpReward: experiencesTable.xpReward,
      organisationName: organisationsTable.name,
    })
    .from(feedActivityEventsTable)
    .innerJoin(usersTable, eq(usersTable.id, feedActivityEventsTable.actorId))
    .leftJoin(
      postsTable,
      and(
        eq(postsTable.id, feedActivityEventsTable.targetId),
        eq(feedActivityEventsTable.targetType, "post"),
      ),
    )
    .leftJoin(
      experiencesTable,
      and(
        eq(experiencesTable.id, feedActivityEventsTable.targetId),
        eq(feedActivityEventsTable.targetType, "experience"),
      ),
    )
    .leftJoin(
      organisationsTable,
      eq(organisationsTable.id, experiencesTable.organisationId),
    )
    .where(
      and(
        eq(feedActivityEventsTable.actorId, profileId),
        eq(feedActivityEventsTable.type, "status_posted"),
        eq(feedActivityEventsTable.targetType, "post"),
        visibleToViewer(
          user.id,
          [...new Set([user.id, ...friendIds])],
          communityChatIds,
        ),
      ),
    )
    .orderBy(desc(feedActivityEventsTable.createdAt), desc(feedActivityEventsTable.id))
    .limit(20);

  const pageRows = rows.filter((row) => row.post !== null);
  const activityIds = pageRows.map((row) => row.event.id);
  const [reactionCounts, commentCounts, viewerReactions] = activityIds.length
    ? await Promise.all([
        db
          .select({ activityId: postReactionsTable.activityId, value: count() })
          .from(postReactionsTable)
          .where(inArray(postReactionsTable.activityId, activityIds))
          .groupBy(postReactionsTable.activityId),
        db
          .select({ activityId: commentsTable.activityId, value: count() })
          .from(commentsTable)
          .where(inArray(commentsTable.activityId, activityIds))
          .groupBy(commentsTable.activityId),
        db
          .select({
            activityId: postReactionsTable.activityId,
            reactionType: postReactionsTable.reactionType,
          })
          .from(postReactionsTable)
          .where(
            and(
              inArray(postReactionsTable.activityId, activityIds),
              eq(postReactionsTable.userId, user.id),
            ),
          ),
      ])
    : [[], [], []];

  const reactionCountsById = new Map(
    reactionCounts.map((row) => [row.activityId, Number(row.value)]),
  );
  const commentCountsById = new Map(
    commentCounts.map((row) => [row.activityId, Number(row.value)]),
  );
  const viewerReactionsById = new Map(
    viewerReactions.map((row) => [row.activityId, row.reactionType]),
  );
  const friendIdSet = new Set(friendIds);

  res.json({
    items: pageRows.map((row) =>
      itemFromRow(
        row,
        user.id,
        friendIdSet,
        reactionCountsById.get(row.event.id) ?? 0,
        commentCountsById.get(row.event.id) ?? 0,
        viewerReactionsById.get(row.event.id) ?? null,
      ),
    ),
  });
});

router.get("/feed/preferences", requireTelegramUser, async (req, res) => {
  const user = currentUser(req);
  const preference = await db.query.feedPreferencesTable.findFirst({
    where: eq(feedPreferencesTable.userId, user.id),
  });
  res.json({ shareActivityWithFriends: preference?.shareActivityWithFriends ?? false });
});

router.patch("/feed/preferences", requireTelegramUser, async (req, res) => {
  const parsed = UpdateFeedPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Choose whether to share your activity with friends.");
    return;
  }
  const user = currentUser(req);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(feedPreferencesTable)
      .values({
        userId: user.id,
        shareActivityWithFriends: parsed.data.shareActivityWithFriends,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: feedPreferencesTable.userId,
        set: {
          shareActivityWithFriends: parsed.data.shareActivityWithFriends,
          updatedAt: now,
        },
      });
    await tx
      .update(feedActivityEventsTable)
      .set({ visibility: parsed.data.shareActivityWithFriends ? "friends" : "private" })
      .where(
        and(
          eq(feedActivityEventsTable.actorId, user.id),
          inArray(feedActivityEventsTable.type, [...automaticActivityTypes]),
        ),
      );
  });
  res.json({ shareActivityWithFriends: parsed.data.shareActivityWithFriends });
});

router.post("/posts", requireTelegramUser, async (req, res) => {
  const parsed = CreateFeedPostBody.safeParse(req.body);
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!parsed.success || !body) {
    error(res, 400, "Write an update of up to 500 characters.");
    return;
  }
  const user = currentUser(req);
  const visibility = parsed.data.visibility ?? "friends";
  const communityChatId = parsed.data.communityChatId ?? null;
  const broadcastToTelegram = parsed.data.broadcastToTelegram ?? false;
  if (visibility === "community" && !communityChatId) {
    error(res, 400, "Choose a community for this update.");
    return;
  }
  if (visibility !== "community" && (communityChatId || broadcastToTelegram)) {
    error(res, 400, "Community updates must be shared only with the selected community.");
    return;
  }
  if (communityChatId && !(await ensureCommunityFeedSchema(res))) return;
  let linkedTelegramCommunity: { chatId: string; chatTitle: string } | null = null;
  if (communityChatId) {
    const [membership] = await db
      .select({ chatId: communityMembersTable.chatId })
      .from(communityMembersTable)
      .where(
        and(
          eq(communityMembersTable.chatId, communityChatId),
          eq(communityMembersTable.userId, user.id),
        ),
      )
      .limit(1);
    if (user.userType === "organisation") {
      const [linked] = await db
        .select({
          chatId: telegramCommunitiesTable.chatId,
          chatTitle: telegramCommunitiesTable.chatTitle,
        })
        .from(telegramCommunitiesTable)
        .where(
          and(
            eq(telegramCommunitiesTable.chatId, communityChatId),
            eq(telegramCommunitiesTable.connectedByUserId, user.id),
          ),
        )
        .limit(1);
      if (linked) linkedTelegramCommunity = linked;
    }
    if (!membership && !linkedTelegramCommunity) {
      error(res, 403, "Join and verify this Telegram community before posting there.");
      return;
    }
  }
  if (broadcastToTelegram) {
    if (!linkedTelegramCommunity) {
      error(res, 403, "This organisation does not manage the selected Telegram community.");
      return;
    }
  }
  let rateLimited = false;
  let pushTokens: string[] = [];
  const event = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.id}, 7341)`);
    const [recentPosts] = await tx
      .select({ value: count() })
      .from(postsTable)
      .where(
        and(
          eq(postsTable.authorId, user.id),
          sql`${postsTable.createdAt} >= now() - interval '24 hours'`,
        ),
      );
    if (!canCreateFeedPost(Number(recentPosts?.value ?? 0))) {
      rateLimited = true;
      return null;
    }
    const [post] = await tx
      .insert(postsTable)
      .values({ authorId: user.id, kind: parsed.data.kind, body, visibility })
      .returning();
    if (!post) throw new Error("The update could not be created.");
    const [createdEvent] = await tx
      .insert(feedActivityEventsTable)
      .values({
        actorId: user.id,
        type: "status_posted",
        targetType: "post",
        targetId: post.id,
        visibility,
        metadata: communityChatId ? { communityChatId } : {},
      })
      .returning();
    if (!createdEvent) throw new Error("The update could not be added to the feed.");
    if (communityChatId) {
      const members = await tx
        .select({ userId: communityMembersTable.userId })
        .from(communityMembersTable)
        .where(eq(communityMembersTable.chatId, communityChatId));
      const recipientIds = [...new Set(
        members
          .filter((member) => member.userId !== user.id)
          .map((member) => member.userId),
      )];
      if (recipientIds.length) {
        await tx
          .insert(feedNotificationsTable)
          .values(
            recipientIds.map((recipientUserId) => ({
                recipientUserId,
                actorUserId: user.id,
                activityId: createdEvent.id,
                communityChatId,
              })),
          )
          .onConflictDoNothing();
        const optedInDevices = await tx
          .select({ token: feedPushTokensTable.expoPushToken })
          .from(feedPushTokensTable)
          .where(
            and(
              inArray(feedPushTokensTable.userId, recipientIds),
              eq(feedPushTokensTable.enabled, true),
            ),
          );
        pushTokens = optedInDevices.map((device) => device.token);
      }
    }
    return createdEvent;
  });
  if (rateLimited || !event) {
    error(res, 429, "You have reached the limit of 10 updates in 24 hours.");
    return;
  }
  const { row, friendIds } = await getFeedItemRow(event.id, user.id);
  if (!row) {
    error(res, 500, "The update was created but could not be loaded.");
    return;
  }
  if (communityChatId && pushTokens.length) {
    const invalidTokens = await sendCommunityUpdatePushes(
      pushTokens,
      communityChatId,
      event.id,
    );
    if (invalidTokens.length) {
      await db
        .delete(feedPushTokensTable)
        .where(inArray(feedPushTokensTable.expoPushToken, invalidTokens));
    }
  }
  let telegramBroadcastStatus: "not_requested" | "sent" | "failed" =
    broadcastToTelegram ? "failed" : "not_requested";
  if (broadcastToTelegram && linkedTelegramCommunity) {
    const delivered = await sendTelegramCommunityUpdate({
      chatId: linkedTelegramCommunity.chatId,
      communityTitle: linkedTelegramCommunity.chatTitle,
      authorName: user.name,
      body,
    });
    telegramBroadcastStatus = delivered ? "sent" : "failed";
  }
  res.status(201).json({
    item: itemFromRow(row, user.id, new Set(friendIds), 0, 0, null),
    telegramBroadcastStatus,
  });
});

router.get("/posts/:postId", requireTelegramUser, async (req, res) => {
  const parsed = GetFeedItemParams.safeParse({ postId: Number(req.params.postId) });
  if (!parsed.success) {
    error(res, 400, "Invalid feed item.");
    return;
  }
  const user = currentUser(req);
  const { row, friendIds } = await getFeedItemRow(parsed.data.postId, user.id);
  if (!row) {
    error(res, 404, "Feed item not found.");
    return;
  }
  const [reactions, comments] = await Promise.all([
    reactionState(row.event.id, user.id),
    db
      .select({ value: count() })
      .from(commentsTable)
      .where(eq(commentsTable.activityId, row.event.id)),
  ]);
  res.json(
    itemFromRow(
      row,
      user.id,
      new Set(friendIds),
      reactions.count,
      Number(comments[0]?.value ?? 0),
      reactions.reactionType,
    ),
  );
});

router.delete("/posts/:postId", requireTelegramUser, async (req, res) => {
  const activityId = parsePositiveId(req.params.postId);
  if (!activityId) {
    error(res, 400, "Invalid feed update.");
    return;
  }
  const user = currentUser(req);
  const deleted = await db.transaction(async (tx) => {
    const [event] = await tx
      .select({
        id: feedActivityEventsTable.id,
        targetId: feedActivityEventsTable.targetId,
      })
      .from(feedActivityEventsTable)
      .where(
        and(
          eq(feedActivityEventsTable.id, activityId),
          eq(feedActivityEventsTable.actorId, user.id),
          eq(feedActivityEventsTable.type, "status_posted"),
          eq(feedActivityEventsTable.targetType, "post"),
        ),
      )
      .limit(1);
    if (!event) return false;
    await tx
      .delete(postsTable)
      .where(and(eq(postsTable.id, event.targetId), eq(postsTable.authorId, user.id)));
    await tx.delete(feedActivityEventsTable).where(eq(feedActivityEventsTable.id, event.id));
    return true;
  });
  if (!deleted) {
    error(res, 404, "Update not found.");
    return;
  }
  res.status(204).send();
});

router.post("/posts/:postId/report", requireTelegramUser, async (req, res) => {
  if (!(await ensureCommunityFeedSchema(res))) return;
  const activityId = parsePositiveId(req.params.postId);
  const body = ReportFeedPostBody.safeParse(req.body);
  if (!activityId || !body.success) {
    error(res, 400, "Choose a valid reason for reporting this update.");
    return;
  }
  const user = currentUser(req);
  const { row } = await getFeedItemRow(activityId, user.id);
  if (!row || row.event.type !== "status_posted" || !row.post) {
    error(res, 404, "Update not found.");
    return;
  }
  if (row.event.actorId === user.id) {
    error(res, 400, "You cannot report your own update.");
    return;
  }
  const [report] = await db
    .insert(feedPostReportsTable)
    .values({
      activityId,
      reportedActivityId: activityId,
      reportedAuthorId: row.event.actorId,
      reporterUserId: user.id,
      reason: body.data.reason,
      details: body.data.details?.trim() || null,
    })
    .onConflictDoNothing({
      target: [
        feedPostReportsTable.reporterUserId,
        feedPostReportsTable.reportedActivityId,
      ],
    })
    .returning({ id: feedPostReportsTable.id });
  if (!report) {
    error(res, 409, "You have already reported this update.");
    return;
  }
  res.status(204).send();
});

router.put("/posts/:postId/reaction", requireTelegramUser, async (req, res) => {
  const parsed = SetFeedReactionParams.safeParse({ postId: Number(req.params.postId) });
  const input = SetFeedReactionBody.safeParse(req.body);
  if (!parsed.success || !input.success) {
    error(res, 400, "Choose a valid reaction.");
    return;
  }
  const user = currentUser(req);
  const { row } = await getFeedItemRow(parsed.data.postId, user.id);
  if (!row) {
    error(res, 404, "Feed item not found.");
    return;
  }
  await db
    .insert(postReactionsTable)
    .values({
      activityId: parsed.data.postId,
      userId: user.id,
      reactionType: input.data.reactionType,
    })
    .onConflictDoUpdate({
      target: [postReactionsTable.activityId, postReactionsTable.userId],
      set: { reactionType: input.data.reactionType, createdAt: new Date() },
    });
  res.json(await reactionState(parsed.data.postId, user.id));
});

router.delete("/posts/:postId/reaction", requireTelegramUser, async (req, res) => {
  const parsed = RemoveFeedReactionParams.safeParse({ postId: Number(req.params.postId) });
  if (!parsed.success) {
    error(res, 400, "Invalid feed item.");
    return;
  }
  const user = currentUser(req);
  const { row } = await getFeedItemRow(parsed.data.postId, user.id);
  if (!row) {
    error(res, 404, "Feed item not found.");
    return;
  }
  await db
    .delete(postReactionsTable)
    .where(
      and(
        eq(postReactionsTable.activityId, parsed.data.postId),
        eq(postReactionsTable.userId, user.id),
      ),
    );
  res.json(await reactionState(parsed.data.postId, user.id));
});

router.get("/posts/:postId/comments", requireTelegramUser, async (req, res) => {
  const parsed = ListFeedCommentsParams.safeParse({ postId: Number(req.params.postId) });
  if (!parsed.success) {
    error(res, 400, "Invalid feed item.");
    return;
  }
  const user = currentUser(req);
  const { row, friendIds } = await getFeedItemRow(parsed.data.postId, user.id);
  if (!row) {
    error(res, 404, "Feed item not found.");
    return;
  }
  const comments = await db
    .select({ comment: commentsTable, actor: usersTable })
    .from(commentsTable)
    .innerJoin(usersTable, eq(usersTable.id, commentsTable.userId))
    .where(eq(commentsTable.activityId, parsed.data.postId))
    .orderBy(asc(commentsTable.createdAt), asc(commentsTable.id))
    .limit(100);
  const friendIdSet = new Set(friendIds);
  res.json({
    comments: comments.map(({ comment, actor }) => ({
      id: comment.id,
      activityId: comment.activityId,
      body: comment.body,
      createdAt: comment.createdAt,
      actor: {
        id: actor.id,
        name: actor.name,
        username: actor.username,
        avatarUrl: actor.avatarUrl,
        city: actor.id === user.id || friendIdSet.has(actor.id) ? actor.city : null,
        userType: actor.userType,
        isFriend: friendIdSet.has(actor.id),
      },
      canDelete: comment.userId === user.id,
    })),
  });
});

router.post("/posts/:postId/comments", requireTelegramUser, async (req, res) => {
  const parsed = CreateFeedCommentParams.safeParse({ postId: Number(req.params.postId) });
  const input = CreateFeedCommentBody.safeParse(req.body);
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!parsed.success || !input.success || !body) {
    error(res, 400, "Write a comment of up to 280 characters.");
    return;
  }
  const user = currentUser(req);
  const { row } = await getFeedItemRow(parsed.data.postId, user.id);
  if (!row) {
    error(res, 404, "Feed item not found.");
    return;
  }
  let rateLimited = false;
  const comment = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.id}, 7342)`);
    const [recentComments] = await tx
      .select({ value: count() })
      .from(commentsTable)
      .where(
        and(
          eq(commentsTable.userId, user.id),
          sql`${commentsTable.createdAt} >= now() - interval '1 minute'`,
        ),
      );
    if (!canCreateFeedComment(Number(recentComments?.value ?? 0))) {
      rateLimited = true;
      return null;
    }
    const [created] = await tx
      .insert(commentsTable)
      .values({ activityId: parsed.data.postId, userId: user.id, body })
      .returning();
    return created ?? null;
  });
  if (rateLimited || !comment) {
    error(res, 429, "You have reached the limit of 10 comments per minute.");
    return;
  }
  const friendIds = await getAcceptedFriendIds(user.id);
  res.status(201).json({
    id: comment.id,
    activityId: comment.activityId,
    body: comment.body,
    createdAt: comment.createdAt,
    actor: {
      id: user.id,
      name: user.name,
      username: user.username,
      avatarUrl: user.avatarUrl,
      city: null,
      userType: user.userType,
      isFriend: friendIds.includes(user.id),
    },
    canDelete: true,
  });
});

router.delete("/comments/:commentId", requireTelegramUser, async (req, res) => {
  const parsed = DeleteFeedCommentParams.safeParse({
    commentId: Number(req.params.commentId),
  });
  if (!parsed.success) {
    error(res, 400, "Invalid comment.");
    return;
  }
  const user = currentUser(req);
  const [deleted] = await db
    .delete(commentsTable)
    .where(
      and(
        eq(commentsTable.id, parsed.data.commentId),
        eq(commentsTable.userId, user.id),
      ),
    )
    .returning({ id: commentsTable.id });
  if (!deleted) {
    error(res, 404, "Comment not found.");
    return;
  }
  res.json({ success: true });
});

export default router;