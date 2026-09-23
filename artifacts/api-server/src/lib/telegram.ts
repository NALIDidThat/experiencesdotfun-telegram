import { logger } from "./logger";
import { db } from "@workspace/db";
import {
  experiencesTable,
  friendshipsTable,
  organisationsTable,
  participationsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  findUserByTelegramId,
  findUserByUsername,
  upsertTelegramUser,
  type TelegramIdentity,
} from "./auth";
import { experienceResponse, userResponse } from "./data";
import { createOrReopenFriendRequest } from "./friends";

type TelegramButton = {
  text: string;
  web_app?: { url: string };
  callback_data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number; type?: string };
    text?: string;
    from?: TelegramIdentity;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramIdentity;
    message?: { chat: { id: number; type?: string }; message_id: number };
  };
};

const botCommands = [
  { command: "start", description: "Open Experiences.fun" },
  { command: "onboarding", description: "Finish setting up your profile" },
  { command: "menu", description: "Open the Experiences.fun menu" },
  { command: "create", description: "Create an experience" },
  { command: "experiences", description: "Find experiences" },
  { command: "xp", description: "Review XP and its sources" },
  { command: "add", description: "Add a friend by username" },
  { command: "profile", description: "View your profile" },
  { command: "friends", description: "View your friends" },
  { command: "requests", description: "View friend requests" },
  { command: "host", description: "Open host tools" },
  { command: "help", description: "View commands" },
];

const token = () => process.env.TELEGRAM_BOT_TOKEN;
let botUsername: string | null = null;
let botRunning = false;

export function escapeTelegramHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

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
  const numericChatId = Number(chatId);
  if (!Number.isSafeInteger(numericChatId) || numericChatId <= 0) return null;
  return telegramCall("sendMessage", {
    chat_id: numericChatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
  });
}

export async function sendFriendRequestNotification(
  recipientTelegramId: number | string,
  requesterName: string,
  requesterUsername: string | null,
  requestId: number,
) {
  const requesterLabel = escapeTelegramHtml(requesterUsername ? `@${requesterUsername}` : requesterName);
  return sendTelegramMessage(
    recipientTelegramId,
    `<b>New friend request</b>\n${requesterLabel} wants to connect with you.`,
    [[
      { text: "Accept", callback_data: `friend:accept:${requestId}` },
      { text: "Decline", callback_data: `friend:decline:${requestId}` },
    ], [openButton("Open friends", "/?screen=profile")]],
  );
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

async function registerTelegramCommands() {
  const registered = await telegramCall<boolean>("setMyCommands", { commands: botCommands });
  if (!registered && botRunning) {
    logger.warn("Telegram command registration failed; retrying.");
    setTimeout(() => void registerTelegramCommands(), 5_000);
  }
}

function openButton(text: string, path: string): TelegramButton {
  return { text, web_app: { url: miniAppUrl(path) } };
}

function callbackButton(text: string, data: string): TelegramButton {
  return { text, callback_data: data };
}

function displayName(identity: TelegramIdentity): string {
  return escapeTelegramHtml(identity.first_name || identity.username || "there");
}

function hasCompletedOnboarding(user: {
  city: string | null;
  interests: string[];
  participationType: string | null;
}): boolean {
  return Boolean(user.city?.trim() && user.interests.length > 0 && user.participationType);
}

function onboardingKeyboard(): TelegramButton[][] {
  return [
    [openButton("Open Experiences.fun", "/?screen=home")],
    [
      callbackButton("How it works", "onboarding:how"),
      callbackButton("I want to join", "onboarding:join"),
    ],
    [
      callbackButton("I want to host", "onboarding:host"),
      callbackButton("More options", "menu:open"),
    ],
  ];
}

function menuKeyboard(): TelegramButton[][] {
  return [
    [openButton("Open Experiences.fun", "/?screen=home")],
    [
      openButton("Explore", "/?screen=explore"),
      openButton("My profile", "/?screen=profile"),
    ],
    [
      openButton("Create experience", "/?screen=create"),
      openButton("Host tools", "/?screen=host"),
    ],
    [callbackButton("How it works", "onboarding:how")],
  ];
}

async function sendOnboarding(
  chatId: number,
  identity: TelegramIdentity,
  complete: boolean,
) {
  const name = displayName(identity);
  const message = complete
    ? `<b>Welcome back, ${name}.</b>\n\nYour profile is ready. Use the buttons below to find an experience, host one, or review your progress.`
    : `<b>Welcome to Experiences.fun, ${name}.</b>\n\nFind small ways to make a real difference near you. Set up your profile in the Mini App, then discover experiences, join a team, and earn verified XP.\n\n<b>Start here</b>\n1. Open the Mini App\n2. Add your interests and city\n3. Choose whether you want to join, host, or do both`;
  return sendTelegramMessage(chatId, message, onboardingKeyboard());
}

async function sendHowItWorks(chatId: number) {
  return sendTelegramMessage(
    chatId,
    `<b>How Experiences.fun works</b>\n\n<b>1 · Set up your passport</b>\nTell us what you care about and where you are.\n\n<b>2 · Find your next good thing</b>\nBrowse local community, education, and environmental experiences.\n\n<b>3 · Show up and contribute</b>\nJoin an experience and take part with other people nearby.\n\n<b>4 · Get verified</b>\nHosts verify your contribution so you earn XP and any available reward.\n\nYou can also host an experience if you have something useful for the community.`,
    [
      [openButton("Start setup", "/?screen=home")],
      [callbackButton("Back to menu", "menu:open")],
    ],
  );
}

async function sendCommandMenu(chatId: number) {
  return sendTelegramMessage(
    chatId,
    `<b>Experiences.fun menu</b>\n\nChoose a quick action below, or use one of these commands:\n\n<code>/onboarding</code> Set up your profile\n<code>/experiences</code> Browse upcoming experiences\n<code>/xp</code> Review your XP\n<code>/add @username</code> Send a friend request\n<code>/profile</code> View your profile\n<code>/friends</code> View your friends\n<code>/requests</code> Review friend requests\n<code>/host</code> Open host tools`,
    menuKeyboard(),
  );
}

async function handleCommand(chatId: number, chatType: string | undefined, identity: TelegramIdentity, text: string) {
  const user = await upsertTelegramUser(identity);
  const [rawCommand, ...args] = text.trim().split(/\s+/);
  const command = rawCommand.toLowerCase().split("@")[0];
  const privateCommands = new Set(["/onboarding", "/create", "/xp", "/progress", "/profile", "/friends", "/requests", "/add", "/addfriend", "/host"]);
  if (chatType !== "private" && privateCommands.has(command)) {
    await sendTelegramMessage(chatId, "For your privacy, use this command in a private chat with the Experiences.fun bot.");
    return;
  }
  switch (command) {
    case "/start":
      await sendOnboarding(chatId, identity, hasCompletedOnboarding(user));
      break;
    case "/onboarding":
      await sendTelegramMessage(
        chatId,
        hasCompletedOnboarding(user)
          ? `<b>Your profile is set up.</b>\n\nYou can update your details any time in the Mini App, or jump straight into exploring experiences.`
          : `<b>Finish your profile</b>\n\nAdd your name, interests, city, and participation preference so we can show you more relevant experiences.`,
        [
          [openButton(hasCompletedOnboarding(user) ? "Update profile" : "Complete setup", "/?screen=home")],
          [callbackButton("How it works", "onboarding:how"), callbackButton("Open menu", "menu:open")],
        ],
      );
      break;
    case "/menu":
      await sendCommandMenu(chatId);
      break;
    case "/help":
      await sendTelegramMessage(
        chatId,
        `<b>Experiences.fun commands</b>\n\n<code>/start</code> Open the welcome flow\n<code>/onboarding</code> Finish or update your profile\n<code>/menu</code> Open quick actions\n<code>/create</code> Create an experience\n<code>/experiences</code> Find upcoming experiences\n<code>/xp</code> Review XP and where it came from\n<code>/add @username</code> Send a friend request\n<code>/friends</code> View your friends\n<code>/requests</code> View pending requests\n<code>/profile</code> View your profile\n<code>/host</code> Open host tools`,
        [[callbackButton("Open menu", "menu:open"), callbackButton("How it works", "onboarding:how")]],
      );
      break;
    case "/create":
      await sendTelegramMessage(
        chatId,
        `<b>✨ Create an experience</b>\n\nTurn something you're doing into an experience others can discover and join.`,
        [[openButton("Create experience", "/?screen=create")], [openButton("Open host tools", "/?screen=host")]],
      );
      break;
    case "/xp":
    case "/progress": {
      const profile = await userResponse(user);
      const recent = await db
        .select({ experience: experiencesTable })
        .from(participationsTable)
        .innerJoin(experiencesTable, eq(experiencesTable.id, participationsTable.experienceId))
        .where(
          and(
            eq(participationsTable.userId, user.id),
            eq(participationsTable.status, "verified"),
          ),
        )
        .orderBy(desc(experiencesTable.date))
        .limit(5);
      const sources = recent.length
        ? `\n\n<b>Recent XP</b>\n${recent.map(({ experience }) => `+${experience.xpReward} XP · ${escapeTelegramHtml(experience.title)}`).join("\n")}`
        : "\n\nComplete and verify an experience to start earning XP.";
      await sendTelegramMessage(
        chatId,
        `<b>⚡ Your XP</b>\n\n<b>${profile.xp} XP</b> · ${escapeTelegramHtml(profile.level)}\n${profile.completedCount} experiences completed\n${profile.hostedCount} experiences hosted\n£${(profile.rewardsPence / 100).toFixed(2)} rewards earned${sources}`,
        [[openButton("View XP history", "/?screen=profile")]],
      );
      break;
    }
    case "/experiences": {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await db
        .select()
        .from(experiencesTable)
        .where(
          and(
            eq(experiencesTable.status, "published"),
            gte(experiencesTable.date, today),
          ),
        )
        .orderBy(experiencesTable.date)
        .limit(5);
      if (rows.length === 0) {
        await sendTelegramMessage(
          chatId,
          "<b>No experiences are available today.</b>\n\nOpen Experiences.fun to browse upcoming opportunities.",
          [[openButton("Browse upcoming", "/?screen=explore")]],
        );
        break;
      }
      for (const row of rows) {
        const experience = await experienceResponse(row);
        await sendTelegramMessage(
          chatId,
          `<b>${escapeTelegramHtml(experience.title)}</b>\n${escapeTelegramHtml(experience.city)} · ${escapeTelegramHtml(experience.date)}\n${experience.availablePlaces} places left · +${experience.xpReward} XP${experience.monetaryRewardPence ? ` · £${(experience.monetaryRewardPence / 100).toFixed(2)}` : ""}`,
          [[openButton("View experience", `/?screen=experience&id=${experience.id}`)]],
        );
      }
      break;
    }
    case "/profile": {
      const profile = await userResponse(user);
      await sendTelegramMessage(
        chatId,
        `<b>${escapeTelegramHtml(profile.name)}</b>\n@${escapeTelegramHtml(profile.username ?? "telegram")}\n\n${escapeTelegramHtml(profile.city ?? "Location not set")}\n<b>${escapeTelegramHtml(profile.level)}</b> · ${profile.xp} XP\n${profile.completedCount} completed · ${profile.hostedCount} hosted`,
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
          ? `<b>Your friends</b>\n${rows.map(({ user: friend }) => `@${escapeTelegramHtml(friend.username ?? friend.name)}`).join("\n")}`
          : "You have no friends yet. Use /add @username to connect.",
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
            `<b>Friend request</b>\n@${escapeTelegramHtml(row.user.username ?? row.user.name)} wants to connect with you.`,
            [[
              { text: "Accept", callback_data: `friend:accept:${row.friendship.id}` },
              { text: "Decline", callback_data: `friend:decline:${row.friendship.id}` },
            ]],
          );
        }
      }
      break;
    }
    case "/add":
    case "/addfriend": {
      const username = args[0]?.replace(/^@/, "");
      if (!username) {
        await sendTelegramMessage(
          chatId,
          "<b>👥 Add friends</b>\n\nSend <code>/add @username</code> or open your profile to search.",
          [[openButton("Search in Experiences.fun", "/?screen=profile")]],
        );
        break;
      }
      const friend = username ? await findUserByUsername(username) : undefined;
      if (!friend || friend.id === user.id) {
        await sendTelegramMessage(chatId, "I couldn't find that participant. Ask them to open Experiences.fun first.");
        break;
      }
      const result = await createOrReopenFriendRequest(user.id, friend.id);
      if (result.outcome === "exists") {
        await sendTelegramMessage(chatId, "A request or friendship already exists for this participant.");
        break;
      }
      await sendTelegramMessage(chatId, `Friend request sent to @${escapeTelegramHtml(friend.username ?? friend.name)}.`);
      await sendFriendRequestNotification(
        friend.telegramId,
        user.name,
        user.username,
        result.request.id,
      );
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
        `<b>${escapeTelegramHtml(organisation?.name ?? "Organisation dashboard")}</b>\n\n<b>${experienceIds.length}</b> experiences hosted\n<b>${overview.filter((item) => item.participantId).length}</b> participant records\n\nUse the Mini App to manage your volunteering opportunities.`,
        [[openButton("Manage experiences", "/?screen=host"), openButton("Create experience", "/?screen=create")], [openButton("Review participants", "/?screen=host")]],
      );
      break;
    }
    default:
      await sendTelegramMessage(chatId, "I don't recognise that command. Use /help to see what I can do.");
  }
}

async function handleCallback(update: NonNullable<TelegramUpdate["callback_query"]>) {
  await answerCallback(update.id);
  if (update.message?.chat.type && update.message.chat.type !== "private") return;
  const chatId = update.message?.chat.id ?? update.from.id;
  const callback = update.data ?? "";
  if (callback === "menu:open") {
    await sendCommandMenu(chatId);
    return;
  }
  if (callback === "onboarding:how") {
    await sendHowItWorks(chatId);
    return;
  }
  if (callback === "onboarding:join") {
    await sendTelegramMessage(
      chatId,
      "<b>Great — let's find your next good thing.</b>\n\nComplete your profile first, then browse nearby experiences and choose one that fits your interests and time.",
      [
        [openButton("Complete profile", "/?screen=home")],
        [openButton("Browse experiences", "/?screen=explore"), callbackButton("Back to menu", "menu:open")],
      ],
    );
    return;
  }
  if (callback === "onboarding:host") {
    await sendTelegramMessage(
      chatId,
      "<b>Want to host?</b>\n\nCreate an experience for people in your community. Add the details, choose the date, and manage participants from the Mini App.",
      [
        [openButton("Create an experience", "/?screen=create")],
        [openButton("Host tools", "/?screen=host"), callbackButton("Back to menu", "menu:open")],
      ],
    );
    return;
  }
  const [kind, action, rawId] = update.data?.split(":") ?? [];
  const id = Number(rawId);
  if (kind !== "friend" || !["accept", "decline"].includes(action) || !Number.isSafeInteger(id)) return;
  const user = await findUserByTelegramId(update.from.id);
  if (!user) return;
  const request = await db.query.friendshipsTable.findFirst({
    where: and(eq(friendshipsTable.id, id), eq(friendshipsTable.recipientUserId, user.id)),
  });
  if (!request || request.status !== "pending") return;
  const accepted = action === "accept";
  const [updated] = await db
    .update(friendshipsTable)
    .set({ status: accepted ? "accepted" : "declined", acceptedAt: accepted ? new Date() : null })
    .where(
      and(
        eq(friendshipsTable.id, id),
        eq(friendshipsTable.recipientUserId, user.id),
        eq(friendshipsTable.status, "pending"),
      ),
    )
    .returning();
  if (!updated) return;
  await sendTelegramMessage(update.message?.chat.id ?? user.telegramId, accepted ? "You're now connected." : "Friend request declined.");
  const requester = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, request.requesterUserId),
  });
  if (accepted && requester) {
    await sendTelegramMessage(requester.telegramId, `@${escapeTelegramHtml(user.username ?? user.name)} accepted your friend request.`);
  }
}

async function poll(offset: number): Promise<void> {
  let nextOffset = offset;
  try {
    const updates = await telegramCall<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: 25,
      allowed_updates: ["message", "callback_query"],
    });
    for (const update of updates ?? []) {
      nextOffset = Math.max(nextOffset, update.update_id + 1);
      try {
        if (update.message?.text && update.message.from) {
          await handleCommand(update.message.chat.id, update.message.chat.type, update.message.from, update.message.text);
        } else if (update.callback_query) {
          await handleCallback(update.callback_query);
        }
      } catch (error) {
        logger.error({ err: error, updateId: update.update_id }, "Telegram update handling failed");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Telegram polling iteration failed");
  } finally {
    if (token() && botRunning) {
      setTimeout(() => void poll(nextOffset), 500);
    }
  }
}

export async function startTelegramBot() {
  if (botRunning) return;
  if (!token()) {
    logger.warn("TELEGRAM_BOT_TOKEN is not configured; bot polling is disabled.");
    return;
  }
  botRunning = true;
  const me = await telegramCall<{ username?: string }>("getMe", {});
  if (!me) {
    botRunning = false;
    setTimeout(() => void startTelegramBot(), 5_000);
    return;
  }
  botUsername = me.username ?? null;
  await telegramCall("deleteWebhook", { drop_pending_updates: false });
  await registerTelegramCommands();
  logger.info({ username: me.username }, "Telegram bot polling started");
  void poll(0);
}