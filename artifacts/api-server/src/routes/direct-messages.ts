import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  max,
  or,
  sql,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateDirectConversationBody,
  GetDirectConversationParams,
  ListDirectMessagesQueryParams,
  MarkDirectConversationReadParams,
  SearchDirectMessageProfilesQueryParams,
  SendDirectMessageBody,
  SendDirectMessageParams,
} from "@workspace/api-zod";
import {
  db,
  directConversationsTable,
  directMessagesTable,
  usersTable,
} from "@workspace/db";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  canonicalParticipantPair,
  DIRECT_MESSAGE_RATE_LIMIT,
  isDirectMessageRateLimited,
  normalizedMessageBody,
  otherParticipantId,
} from "../lib/direct-messaging-rules";

const router: IRouter = Router();
router.use(requireTelegramUser);

type DirectConversationRow = typeof directConversationsTable.$inferSelect;

function publicProfile(user: {
  id: number;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  userType: "participant" | "organisation" | null;
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    userType: user.userType,
  };
}

function messageResponse(message: typeof directMessagesTable.$inferSelect) {
  return {
    id: message.id,
    senderId: message.senderUserId,
    body: message.body,
    createdAt: message.createdAt,
    readAt: message.readAt,
  };
}

async function findConversationForParticipant(conversationId: number, userId: number) {
  const [conversation] = await db
    .select()
    .from(directConversationsTable)
    .where(
      and(
        eq(directConversationsTable.id, conversationId),
        or(
          eq(directConversationsTable.participantAUserId, userId),
          eq(directConversationsTable.participantBUserId, userId),
        ),
      ),
    )
    .limit(1);
  return conversation;
}

async function serializeConversations(rows: DirectConversationRow[], viewerId: number) {
  if (rows.length === 0) return [];

  const peerIds = rows
    .map((row) => otherParticipantId(row, viewerId))
    .filter((id): id is number => id !== null);
  const conversationIds = rows.map((row) => row.id);
  if (peerIds.length !== rows.length) {
    throw new Error("A conversation summary was requested for a non-participant.");
  }

  const latestMessageIds = db
    .select({
      conversationId: directMessagesTable.conversationId,
      latestMessageId: max(directMessagesTable.id),
    })
    .from(directMessagesTable)
    .where(inArray(directMessagesTable.conversationId, conversationIds))
    .groupBy(directMessagesTable.conversationId)
    .as("latest_direct_messages");

  const [users, latestMessages, unreadRows] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl,
        userType: usersTable.userType,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, peerIds)),
    db
      .select({ conversationId: directMessagesTable.conversationId, message: directMessagesTable })
      .from(directMessagesTable)
      .innerJoin(
        latestMessageIds,
        eq(directMessagesTable.id, latestMessageIds.latestMessageId),
      ),
    db
      .select({
        conversationId: directMessagesTable.conversationId,
        unreadCount: count(),
      })
      .from(directMessagesTable)
      .where(
        and(
          inArray(directMessagesTable.conversationId, conversationIds),
          isNull(directMessagesTable.readAt),
          sql`${directMessagesTable.senderUserId} <> ${viewerId}`,
        ),
      )
      .groupBy(directMessagesTable.conversationId),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const latestByConversation = new Map(
    latestMessages.map((row) => [row.conversationId, row.message]),
  );
  const unreadByConversation = new Map(
    unreadRows.map((row) => [row.conversationId, Number(row.unreadCount)]),
  );

  return rows.map((row) => {
    const peerId = otherParticipantId(row, viewerId);
    const peer = peerId === null ? undefined : userById.get(peerId);
    if (!peer) {
      throw new Error(`Conversation ${row.id} has no participant profile.`);
    }
    const lastMessage = latestByConversation.get(row.id) ?? null;
    return {
      id: row.id,
      otherUser: publicProfile(peer),
      lastMessage: lastMessage ? messageResponse(lastMessage) : null,
      lastMessageAt: lastMessage?.createdAt ?? null,
      unreadCount: unreadByConversation.get(row.id) ?? 0,
    };
  });
}

router.get("/direct-messages/profiles", async (req, res): Promise<void> => {
  const parsed = SearchDirectMessageProfilesQueryParams.safeParse(req.query);
  const search = parsed.success ? parsed.data.search.trim() : "";
  if (!parsed.success || search.length < 2) {
    res.status(400).json({ message: "Enter at least two characters to search profiles." });
    return;
  }

  const escapedSearch = search.replace(/[\\%_]/g, "\\$&");
  const userId = currentUser(req).id;
  const profiles = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
      avatarUrl: usersTable.avatarUrl,
      userType: usersTable.userType,
    })
    .from(usersTable)
    .where(
      and(
        sql`${usersTable.id} <> ${userId}`,
        or(
          ilike(usersTable.name, `%${escapedSearch}%`),
          ilike(usersTable.username, `%${escapedSearch}%`),
        ),
      ),
    )
    .orderBy(usersTable.name)
    .limit(parsed.data.limit);

  res.json(profiles.map(publicProfile));
});

router.get("/direct-messages/conversations", async (req, res): Promise<void> => {
  const userId = currentUser(req).id;
  const conversations = await db
    .select()
    .from(directConversationsTable)
    .where(
      or(
        eq(directConversationsTable.participantAUserId, userId),
        eq(directConversationsTable.participantBUserId, userId),
      ),
    )
    .orderBy(
      desc(
        sql`COALESCE(${directConversationsTable.lastMessageAt}, ${directConversationsTable.createdAt})`,
      ),
    )
    .limit(100);
  res.json(await serializeConversations(conversations, userId));
});

router.post("/direct-messages/conversations", async (req, res): Promise<void> => {
  const parsed = CreateDirectConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a profile to message." });
    return;
  }

  const userId = currentUser(req).id;
  const pair = canonicalParticipantPair(userId, parsed.data.recipientId);
  if (!pair) {
    res.status(400).json({ message: "You cannot start a conversation with your own profile." });
    return;
  }

  const [recipient] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, pair.participantAUserId === userId
      ? pair.participantBUserId
      : pair.participantAUserId))
    .limit(1);
  if (!recipient) {
    res.status(404).json({ message: "That profile could not be found." });
    return;
  }

  await db
    .insert(directConversationsTable)
    .values(pair)
    .onConflictDoNothing({
      target: [
        directConversationsTable.participantAUserId,
        directConversationsTable.participantBUserId,
      ],
    });

  const [conversation] = await db
    .select()
    .from(directConversationsTable)
    .where(
      and(
        eq(directConversationsTable.participantAUserId, pair.participantAUserId),
        eq(directConversationsTable.participantBUserId, pair.participantBUserId),
      ),
    )
    .limit(1);
  if (!conversation) {
    throw new Error("The direct conversation could not be created or retrieved.");
  }

  res.json((await serializeConversations([conversation], userId))[0]);
});

router.get("/direct-messages/conversations/:conversationId", async (req, res): Promise<void> => {
  const parsed = GetDirectConversationParams.safeParse({
    conversationId: Number(req.params.conversationId),
  });
  if (!parsed.success) {
    res.status(400).json({ message: "That conversation ID is invalid." });
    return;
  }

  const conversation = await findConversationForParticipant(
    parsed.data.conversationId,
    currentUser(req).id,
  );
  if (!conversation) {
    res.status(404).json({ message: "That conversation could not be found." });
    return;
  }
  res.json((await serializeConversations([conversation], currentUser(req).id))[0]);
});

router.get("/direct-messages/messages", async (req, res): Promise<void> => {
  const parsed = ListDirectMessagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "The conversation message request is invalid." });
    return;
  }

  const userId = currentUser(req).id;
  const conversation = await findConversationForParticipant(parsed.data.conversationId, userId);
  if (!conversation) {
    res.status(404).json({ message: "That conversation could not be found." });
    return;
  }

  const rows = await db
    .select()
    .from(directMessagesTable)
    .where(
      and(
        eq(directMessagesTable.conversationId, conversation.id),
        parsed.data.beforeId === undefined
          ? undefined
          : lt(directMessagesTable.id, parsed.data.beforeId),
      ),
    )
    .orderBy(desc(directMessagesTable.id))
    .limit(parsed.data.limit + 1);
  res.json({
    messages: rows.slice(0, parsed.data.limit).map(messageResponse),
    hasMore: rows.length > parsed.data.limit,
  });
});

router.post(
  "/direct-messages/conversations/:conversationId/messages",
  async (req, res): Promise<void> => {
    const params = SendDirectMessageParams.safeParse({
      conversationId: Number(req.params.conversationId),
    });
    const parsed = SendDirectMessageBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ message: "Write a message of up to 2,000 characters." });
      return;
    }

    const user = currentUser(req);
    const conversation = await findConversationForParticipant(params.data.conversationId, user.id);
    if (!conversation) {
      res.status(404).json({ message: "That conversation could not be found." });
      return;
    }
    if (otherParticipantId(conversation, user.id) === null) {
      res.status(404).json({ message: "That conversation could not be found." });
      return;
    }

    const body = normalizedMessageBody(parsed.data.body);
    if (!body) {
      res.status(400).json({ message: "Write a message of up to 2,000 characters." });
      return;
    }

    const sendResult = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${"direct-message-send:" + user.id}, 0))`,
      );

      const [recent] = await transaction
        .select({ value: count() })
        .from(directMessagesTable)
        .where(
          and(
            eq(directMessagesTable.senderUserId, user.id),
            gt(directMessagesTable.createdAt, new Date(Date.now() - 60_000)),
          ),
        );
      const recentCount = Number(recent?.value ?? 0);
      if (isDirectMessageRateLimited(recentCount)) {
        return { rateLimited: true as const };
      }

      const [message] = await transaction
        .insert(directMessagesTable)
        .values({
          conversationId: conversation.id,
          senderUserId: user.id,
          body,
        })
        .returning();
      if (!message) {
        throw new Error("The direct message was not persisted.");
      }

      await transaction
        .update(directConversationsTable)
        .set({
          lastMessageAt: sql`GREATEST(COALESCE(${directConversationsTable.lastMessageAt}, ${message.createdAt}), ${message.createdAt})`,
        })
        .where(eq(directConversationsTable.id, conversation.id));

      return { rateLimited: false as const, message };
    });

    if (sendResult.rateLimited) {
      res.status(429).json({
        message: `You can send up to ${DIRECT_MESSAGE_RATE_LIMIT} messages per minute. Try again shortly.`,
      });
      return;
    }
    res.status(201).json(messageResponse(sendResult.message));
  },
);

router.post(
  "/direct-messages/conversations/:conversationId/read",
  async (req, res): Promise<void> => {
    const parsed = MarkDirectConversationReadParams.safeParse({
      conversationId: Number(req.params.conversationId),
    });
    if (!parsed.success) {
      res.status(400).json({ message: "That conversation ID is invalid." });
      return;
    }

    const userId = currentUser(req).id;
    const conversation = await findConversationForParticipant(
      parsed.data.conversationId,
      userId,
    );
    if (!conversation) {
      res.status(404).json({ message: "That conversation could not be found." });
      return;
    }

    const updated = await db
      .update(directMessagesTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(directMessagesTable.conversationId, conversation.id),
          sql`${directMessagesTable.senderUserId} <> ${userId}`,
          isNull(directMessagesTable.readAt),
        ),
      )
      .returning({ id: directMessagesTable.id });
    res.json({ updatedCount: updated.length });
  },
);

export default router;