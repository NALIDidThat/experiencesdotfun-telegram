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
  feedPreferencesTable,
  friendshipsTable,
  experiencesTable,
  organisationsTable,
  postReactionsTable,
  postsTable,
  usersTable,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";

const router: IRouter = Router();
const PAGE_LIMIT_DEFAULT = 20;
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

function visibleToViewer(viewerId: number, friendIds: number[]): SQL {
  return or(
    eq(feedActivityEventsTable.visibility, "public"),
    and(
      eq(feedActivityEventsTable.visibility, "friends"),
      inArray(feedActivityEventsTable.actorId, friendIds),
    ),
    and(
      eq(feedActivityEventsTable.visibility, "private"),
      eq(feedActivityEventsTable.actorId, viewerId),
    ),
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
    case "accountability_checkin":
      return "checked in on a goal";
    case "accountability_goal_completed":
      return "completed a personal goal";
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
  activityId: number,
) {
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
    .where(
      and(
        eq(feedActivityEventsTable.id, activityId),
        visibleToViewer(viewerId, [...new Set([viewerId, ...friendIds])]),
      ),
    );
}

async function getFeedItemRow(activityId: number, viewerId: number) {
  const friendIds = await getAcceptedFriendIds(viewerId);
  const [row] = await itemQuery(viewerId, friendIds, activityId).limit(1);
  return { row, friendIds };
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
  const friendIds = await getAcceptedFriendIds(user.id);
  const visibleActorIds = [...new Set([user.id, ...friendIds])];
  const localPredicate = localToCity(user.city);
  const friendRankPredicate = inArray(feedActivityEventsTable.actorId, visibleActorIds);
  const rankExpression = sql<number>`CASE
    WHEN ${friendRankPredicate} THEN 3
    WHEN ${localPredicate} THEN 2
    ELSE 1
  END`;
  const filters = [visibleToViewer(user.id, visibleActorIds)];

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

router.get("/profiles/:profileId/posts", requireTelegramUser, async (req, res) => {
  const profileId = parsePositiveId(req.params.profileId);
  if (!profileId) {
    error(res, 400, "This profile identifier is invalid.");
    return;
  }

  const user = currentUser(req);
  const friendIds = await getAcceptedFriendIds(user.id);
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
        visibleToViewer(user.id, [...new Set([user.id, ...friendIds])]),
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
  if (parsed.data.visibility === "community") {
    error(res, 400, "Community sharing is not available yet. Choose friends or public.");
    return;
  }
  const user = currentUser(req);
  const visibility = parsed.data.visibility ?? "friends";
  const event = await db.transaction(async (tx) => {
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
      })
      .returning();
    if (!createdEvent) throw new Error("The update could not be added to the feed.");
    return createdEvent;
  });
  const { row, friendIds } = await getFeedItemRow(event.id, user.id);
  if (!row) {
    error(res, 500, "The update was created but could not be loaded.");
    return;
  }
  res.status(201).json(itemFromRow(row, user.id, new Set(friendIds), 0, 0, null));
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
  const [comment] = await db
    .insert(commentsTable)
    .values({ activityId: parsed.data.postId, userId: user.id, body })
    .returning();
  if (!comment) {
    error(res, 500, "Your comment could not be saved.");
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