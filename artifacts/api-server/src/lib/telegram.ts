import { logger } from "./logger";
import { db } from "@workspace/db";
import {
  experiencesTable,
  friendshipsTable,
  organisationsTable,
  participationsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  findUserByTelegramId,
  findUserByUsername,
  upsertTelegramUser,
  type TelegramIdentity,
} from "./auth";
import { experienceResponse, levelForXp, userResponse } from "./data";

type TelegramButton = {
  text: string;
  web_app?: { url: string };
  callback_data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    from?: TelegramIdentity;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramIdentity;
    message?: { chat: { id: number }; message_id: number };
  };
};

const token = () => process.env.TELEGRAM_BOT_TOKEN;
let botUsername: string | null = null;

function miniAppUrl(path = "/"): string {
  const configured = process.env.TELEGRAM_MINI_APP_URL;
  if (configured) return `${configured.replace(/\/$/, "")}${path}`;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}${path}` : `https://experiences.fun${path}`;
}

async function telegramCall<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const botToken = token();
  if (!botToken) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!payload.ok) {
      logger.warn({ method, description: payload.description }, "Telegram API call failed");
      return null;
    }
    return payload.result ?? null;
  } catch (error) {
    logger.warn({ err: error, method }, "Telegram API request failed");
    return null;
  }
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  inlineKeyboard?: TelegramButton[][],
) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
  });
}

export async function getTelegramBotUsername(): Promise<string | null> {
  if (botUsername) return botUsername;
  const me = await telegramCall<{ username?: string }>("getMe", {});
  botUsername = me?.username ?? null;
  return botUsername;
}

async function answerCallback(id: string) {
  await telegramCall("answerCallbackQuery", { callback_query_id: id });
}

function openButton(text: string, path: string): TelegramButton {
  return { text, web_app: { url: miniAppUrl(path) } };
}

async function handleCommand(chatId: number, identity: TelegramIdentity, text: string) {
  const user = await upsertTelegramUser(identity);
  const [command, ...args] = text.trim().split(/\s+/);
  switch (command.toLowerCase()) {
    case "/start":
      await sendTelegramMessage(
        chatId,
        `<b>Welcome to Experiences.fun</b>\n\nDiscover real-world volunteering, contribute with your community and earn XP and rewards.`,
        [[openButton("Open Experiences.fun", "/?screen=home")], [openButton("My Progress", "/?screen=profile"), openButton("Explore", "/?screen=explore")]],
      );
      break;
    case "/help":
      await sendTelegramMessage(
        chatId,
        `<b>Experiences.fun commands</b>\n\n/start — Open Experiences.fun\n/progress — View XP and progress\n/experiences — Discover current experiences\n/friends — View your friends\n/requests — View pending requests\n/profile — View your profile\n/addfriend @username — Send a request\n/host — Open host tools`,
      );
      break;
    case "/progress": {
      const profile = await userResponse(user);
      await sendTelegramMessage(
        chatId,
        `<b>Your Experiences.fun progress</b>\n\n<b>${profile.level}</b>\n${profile.xp} XP\n\n<b>${profile.completedCount}</b> experiences completed\n<b>${profile.hostedCount}</b> experiences hosted\n<b>£${(profile.rewardsPence / 100).toFixed(2)}</b> rewards earned`,
        [[openButton("View full profile", "/?screen=profile")]],
      );
      break;
    }
    case "/experiences": {
      const rows = await db
        .select()
        .from(experiencesTable)
        .where(inArray(experiencesTable.status, ["published", "full"]))
        .orderBy(experiencesTable.date)
        .limit(5);
      if (rows.length === 0) {
        await sendTelegramMessage(chatId, "There are no published experiences yet. Check back soon.");
        break;
      }
      for (const row of rows) {
        const experience = await experienceResponse(row);
        await sendTelegramMessage(
          chatId,
          `<b>${experience.title}</b>\n${experience.city} · ${experience.date}\n${experience.availablePlaces} places left · +${experience.xpReward} XP${experience.monetaryRewardPence ? ` · £${(experience.monetaryRewardPence / 100).toFixed(2)}` : ""}`,
          [[openButton("View experience", `/?screen=experience&id=${experience.id}`)]],
        );
      }
      break;
    }
    case "/profile": {
      const profile = await userResponse(user);
      await sendTelegramMessage(
        chatId,
        `<b>${profile.name}</b>\n@${profile.username ?? "telegram"}\n\n${profile.city ?? "Location not set"}\n<b>${profile.level}</b> · ${profile.xp} XP\n${profile.completedCount} completed · ${profile.hostedCount} hosted`,
        [[openButton("View profile", "/?screen=profile"), openButton("Edit profile", "/?screen=profile&edit=1")]],
      );
      break;
    }
    case "/friends": {
      const outgoing = await db
        .select({ friendship: friendshipsTable, user: usersTable })
        .from(friendshipsTable)
        .innerJoin(usersTable, eq(usersTable.id, friendshipsTable.recipientUserId))
        .where(
          and(
            eq(friendshipsTable.status, "accepted"),
            eq(friendshipsTable.requesterUserId, user.id),
          ),
        )
        .limit(20);
      const incoming = await db
        .select({ friendship: friendshipsTable, user: usersTable })
        .from(friendshipsTable)
        .innerJoin(usersTable, eq(usersTable.id, friendshipsTable.requesterUserId))
        .where(
          and(
            eq(friendshipsTable.status, "accepted"),
            eq(friendshipsTable.recipientUserId, user.id),
          ),
        )
        .limit(20);
      const rows = [...outgoing, ...incoming];
      await sendTelegramMessage(
        chatId,
        rows.length
          ? `<b>Your friends</b>\n${rows.map(({ user: friend }) => `@${friend.username ?? friend.name}`).join("\n")}`
          : "You have no friends yet. Use /addfriend @username to connect.",
        [[openButton("Open friends", "/?screen=profile")]],
      );
      break;
    }
    case "/requests": {
      const rows = await db
        .select({ friendship: friendshipsTable, user: usersTable })
        .from(friendshipsTable)
        .innerJoin(usersTable, eq(usersTable.id, friendshipsTable.requesterUserId))
        .where(
          and(
            eq(friendshipsTable.recipientUserId, user.id),
            eq(friendshipsTable.status, "pending"),
          ),
        );
      if (!rows.length) {
        await sendTelegramMessage(chatId, "No pending friend requests.");
      } else {
        for (const row of rows) {
          await sendTelegramMessage(
            chatId,
            `<b>Friend request</b>\n@${row.user.username ?? row.user.name} wants to connect with you.`,
            [[
              { text: "Accept", callback_data: `friend:accept:${row.friendship.id}` },
              { text: "Decline", callback_data: `friend:decline:${row.friendship.id}` },
            ]],
          );
        }
      }
      break;
    }
    case "/addfriend": {
      const username = args[0]?.replace(/^@/, "");
      const friend = username ? await findUserByUsername(username) : undefined;
      if (!friend || friend.id === user.id) {
        await sendTelegramMessage(chatId, "I couldn't find that participant. Ask them to open Experiences.fun first.");
        break;
      }
      const existing = await db.query.friendshipsTable.findFirst({
        where: orFriendship(user.id, friend.id),
      });
      if (existing) {
        await sendTelegramMessage(chatId, "A request or friendship already exists for this participant.");
        break;
      }
      const [request] = await db
        .insert(friendshipsTable)
        .values({ requesterUserId: user.id, recipientUserId: friend.id })
        .returning();
      if (request) {
        await sendTelegramMessage(chatId, `Friend request sent to @${friend.username ?? friend.name}.`);
        await sendTelegramMessage(
          friend.telegramId,
          `<b>New friend request</b>\n@${user.username ?? user.name} wants to connect with you.`,
          [[
            { text: "Accept", callback_data: `friend:accept:${request.id}` },
            { text: "Decline", callback_data: `friend:decline:${request.id}` },
          ]],
        );
      }
      break;
    }
    case "/host": {
      const overview = await db
        .select({ experienceId: experiencesTable.id, participantId: participationsTable.id })
        .from(organisationsTable)
        .leftJoin(experiencesTable, eq(experiencesTable.organisationId, organisationsTable.id))
        .leftJoin(participationsTable, eq(participationsTable.experienceId, experiencesTable.id))
        .where(eq(organisationsTable.ownerUserId, user.id));
      const organisation = await db.query.organisationsTable.findFirst({
        where: eq(organisationsTable.ownerUserId, user.id),
      });
      const experienceIds = [...new Set(overview.map((item) => item.experienceId).filter(Boolean))];
      await sendTelegramMessage(
        chatId,
        `<b>${organisation?.name ?? "Organisation dashboard"}</b>\n\n<b>${experienceIds.length}</b> experiences hosted\n<b>${overview.filter((item) => item.participantId).length}</b> participant records\n\nUse the Mini App to manage your volunteering opportunities.`,
        [[openButton("Manage experiences", "/?screen=host"), openButton("Create experience", "/?screen=create")], [openButton("Verify participants", "/?screen=verify")]],
      );
      break;
    }
    default:
      await sendTelegramMessage(chatId, "I don't recognise that command. Use /help to see what I can do.");
  }
}

function orFriendship(a: number, b: number) {
  return or(
    and(eq(friendshipsTable.requesterUserId, a), eq(friendshipsTable.recipientUserId, b)),
    and(eq(friendshipsTable.requesterUserId, b), eq(friendshipsTable.recipientUserId, a)),
  );
}

async function handleCallback(update: NonNullable<TelegramUpdate["callback_query"]>) {
  await answerCallback(update.id);
  const [kind, action, rawId] = update.data?.split(":") ?? [];
  const id = Number(rawId);
  if (kind !== "friend" || !Number.isSafeInteger(id)) return;
  const user = await findUserByTelegramId(update.from.id);
  if (!user) return;
  const request = await db.query.friendshipsTable.findFirst({
    where: and(eq(friendshipsTable.id, id), eq(friendshipsTable.recipientUserId, user.id)),
  });
  if (!request || request.status !== "pending") return;
  const accepted = action === "accept";
  await db
    .update(friendshipsTable)
    .set({ status: accepted ? "accepted" : "declined", acceptedAt: accepted ? new Date() : null })
    .where(eq(friendshipsTable.id, id));
  await sendTelegramMessage(update.message?.chat.id ?? user.telegramId, accepted ? "You're now connected." : "Friend request declined.");
  const requester = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, request.requesterUserId),
  });
  if (accepted && requester) {
    await sendTelegramMessage(requester.telegramId, `@${user.username ?? user.name} accepted your friend request.`);
  }
}

async function poll(offset: number): Promise<void> {
  const updates = await telegramCall<TelegramUpdate[]>("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message", "callback_query"],
  });
  let nextOffset = offset;
  for (const update of updates ?? []) {
    nextOffset = Math.max(nextOffset, update.update_id + 1);
    if (update.message?.text && update.message.from) {
      await handleCommand(update.message.chat.id, update.message.from, update.message.text);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  }
  if (token()) {
    setTimeout(() => void poll(nextOffset), 500);
  }
}

export async function startTelegramBot() {
  if (!token()) {
    logger.warn("TELEGRAM_BOT_TOKEN is not configured; bot polling is disabled.");
    return;
  }
  const me = await telegramCall<{ username?: string }>("getMe", {});
  if (!me) return;
  botUsername = me.username ?? null;
  await telegramCall("deleteWebhook", { drop_pending_updates: false });
  await telegramCall("setMyCommands", {
    commands: [
      { command: "start", description: "Open Experiences.fun" },
      { command: "progress", description: "View XP and progress" },
      { command: "experiences", description: "Discover volunteering" },
      { command: "profile", description: "View your profile" },
      { command: "friends", description: "View your friends" },
      { command: "requests", description: "View friend requests" },
      { command: "addfriend", description: "Add a friend" },
      { command: "host", description: "Open host tools" },
      { command: "help", description: "View commands" },
    ],
  });
  logger.info({ username: me.username }, "Telegram bot polling started");
  void poll(0);
}