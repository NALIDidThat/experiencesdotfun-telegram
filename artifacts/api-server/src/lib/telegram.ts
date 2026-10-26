import { logger } from "./logger";
import { db, pool } from "@workspace/db";
import {
  experiencesTable,
  friendshipsTable,
  organisationsTable,
  participationsTable,
  usersTable,
  xpAwardsTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  findUserByTelegramId,
  findUserByUsername,
  upsertTelegramUser,
  type TelegramIdentity,
} from "./auth";
import { experienceResponse, userResponse } from "./data";
import { createOrReopenFriendRequest, updateFriendRequestStatus } from "./friends";
import { claimSocialInvite } from "./social-invites";
import {
  getCommunityLeaderboard,
  getCommunityMemberByUsername,
  getCommunityMemberSummary,
  processAdminCommunityReward,
  processCommunityMessage,
} from "./contribution";
import {
  addTelegramCommunityKeywordRule,
  connectTelegramCommunity,
  disconnectTelegramCommunity,
  getTelegramCommunity,
  getTelegramCommunityManagementContext,
  listTelegramCommunityKeywordRules,
  listTelegramCommunityLinkRules,
  listTelegramOwnedCommunities,
  listTelegramOwnedOrganisations,
  removeTelegramCommunityKeywordRule,
  removeTelegramCommunityKeywordRuleById,
  setTelegramCommunitySpamProtection,
} from "./community-moderation";
import {
  tryAcquireTelegramPollingLease,
  type TelegramPollingLease,
} from "./telegram-polling-lock";
import {
  isTelegramPollingConflict,
  TELEGRAM_POLLING_CONFLICT_BACKOFF_MS,
} from "./telegram-polling-policy";
import {
  extractCommunityMessageLinks,
  getMessageQualification,
  isCommunityLinkWhitelisted,
  isTelegramChatMember,
  matchesCommunityModerationPhrase,
  normalizePublicTelegramGroupUsername,
  parseAdminRewardAmount,
} from "./community-rules";
import {
  chooseGroupRiddle,
  createRiddleRoundStore,
  RIDDLE_REVEAL_AFTER_MS,
} from "./group-riddles";
import { recordAnalyticsEvent } from "./analytics";
import type { AnalyticsEventCategory } from "@workspace/db/schema";
import {
  buildWelcomeKeyboard,
  escapeTelegramHtml,
  formatWelcomeMessage,
  formatCompletionSubmittedNotice,
  formatContributionRejectedNotice,
  formatContributionVerifiedNotice,
  formatExperienceJoinedNotice,
  formatFriendRequestAcceptedNotice,
  formatFriendRequestDeclinedNotice,
  formatFriendRequestNotice,
  formatFriendRequestSentNotice,
  formatFriendshipConnectedNotice,
  formatHostNewParticipantNotice,
  makeChatCompatibleKeyboard,
  parseTelegramCommand,
  type TelegramButton,
  type TelegramExperienceNotice,
} from "./telegram-utils";
export { escapeTelegramHtml } from "./telegram-utils";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type?: string; title?: string };
    text?: string;
    caption?: string;
    entities?: Array<{ type: string; offset: number; length: number; url?: string }>;
    caption_entities?: Array<{ type: string; offset: number; length: number; url?: string }>;
    from?: TelegramIdentity;
    reply_to_message?: {
      message_id: number;
      from?: TelegramIdentity;
      text?: string;
      caption?: string;
    };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramIdentity;
    message?: { chat: { id: number; type?: string; title?: string }; message_id: number };
  };
};

const botCommands = [
  { command: "start", description: "Open Experiences.fun" },
  { command: "menu", description: "Open quick actions" },
  { command: "experiences", description: "Browse upcoming experiences" },
  { command: "xp", description: "View Experience XP and rewards" },
  { command: "rank", description: "View Community XP rank in this group" },
  { command: "leaderboard", description: "View this group's top contributors" },
  { command: "riddle", description: "Start a random riddle" },
  { command: "profile", description: "View your passport and profile" },
  { command: "add", description: "Send a friend request by username" },
  { command: "friends", description: "View your friends" },
  { command: "requests", description: "View pending friend requests" },
  { command: "accountability", description: "Open your accountability partner space" },
  { command: "create", description: "Create a community experience" },
  { command: "host", description: "Open host tools" },
  { command: "onboarding", description: "Finish setting up your profile" },
  { command: "help", description: "Show commands and quick guide" },
  { command: "community", description: "Connect or view this group's controls" },
  { command: "spam", description: "Enable or disable group phrase and link protection" },
  { command: "filter", description: "Add or remove a blocked phrase" },
  { command: "filters", description: "List this group's active phrase filters" },
];
const groupOnlyCommandNames = new Set(["/spam", "/filter", "/filters"]);
const groupCommandNames = new Set([
  "start",
  "menu",
  "experiences",
  "rank",
  "leaderboard",
  "riddle",
  "help",
  "community",
  "spam",
  "filter",
  "filters",
]);
const groupBotCommands = botCommands.filter(({ command }) => groupCommandNames.has(command));
const privateBotCommands = botCommands.filter(
  ({ command }) => !groupOnlyCommandNames.has(`/${command}`),
);

const rankNumberEmojis = ["", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const token = () => process.env.TELEGRAM_BOT_TOKEN;
let botUsername: string | null = null;
let botTelegramId: number | null = null;
let botRunning = false;
let botStarting = false;
let telegramPollingLease: TelegramPollingLease | null = null;
let telegramBotRetryTimer: ReturnType<typeof setTimeout> | null = null;
let consecutivePollingFailures = 0;
let pollingConflictDetected = false;
let lastPollingConflictLogAt = 0;
let lastPollingLeaseBusyLogAt = 0;
const pendingPrivateCommunityPhrases = new Map<
  number,
  { chatId: number; expiresAt: number }
>();
const PRIVATE_COMMUNITY_PHRASE_TTL_MS = 5 * 60_000;
const riddleRounds = createRiddleRoundStore();
const riddleRevealTimers = new Map<
  number,
  { messageId: number; timer: ReturnType<typeof setTimeout> }
>();

function nextPollingRetryDelay(): number {
  consecutivePollingFailures += 1;
  return Math.min(1_000 * 2 ** (consecutivePollingFailures - 1), 60_000);
}

function scheduleTelegramBotRetry(delayMs: number) {
  if (telegramBotRetryTimer) return;
  telegramBotRetryTimer = setTimeout(() => {
    telegramBotRetryTimer = null;
    void startTelegramBot();
  }, delayMs);
}

async function releaseTelegramPollingLease() {
  const lease = telegramPollingLease;
  telegramPollingLease = null;
  if (!lease) return;
  try {
    await lease.release();
  } catch (error) {
    logger.error({ err: error }, "Telegram polling lease release failed");
  }
}

function handleTelegramPollingLeaseLost(error: Error) {
  telegramPollingLease = null;
  botRunning = false;
  logger.error({ err: error }, "Telegram polling lease connection was lost; polling stopped.");
  scheduleTelegramBotRetry(TELEGRAM_POLLING_CONFLICT_BACKOFF_MS);
}

function rankNumber(rank: number): string {
  return rankNumberEmojis[rank] ?? `${rank}.`;
}

function formatCommunityXp(value: number): string {
  return value.toLocaleString("en-GB");
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
      if (isTelegramPollingConflict(method, payload.description)) {
        pollingConflictDetected = true;
        const now = Date.now();
        if (now - lastPollingConflictLogAt >= 60_000) {
          lastPollingConflictLogAt = now;
          logger.error(
            { method, description: payload.description },
            "Another Telegram poller is using this bot token; this process will back off before retrying.",
          );
        }
      } else {
        logger.warn({ method, description: payload.description }, "Telegram API call failed");
      }
      return null;
    }
    return payload.result ?? null;
  } catch (error) {
    logger.warn({ err: error, method }, "Telegram API request failed");
    return null;
  }
}

type TelegramCommunityChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
};

type TelegramCommunityMember = {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  is_member?: boolean;
};

export async function verifyTelegramCommunityMembership(
  group: string,
  telegramUserId: number,
): Promise<
  | { status: "verified"; chatId: string; title: string }
  | { status: "not_member" }
  | { status: "invalid" }
  | { status: "unavailable" }
> {
  const username = normalizePublicTelegramGroupUsername(group);
  if (!username || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    return { status: "invalid" };
  }

  const chat = await telegramCall<TelegramCommunityChat>("getChat", {
    chat_id: `@${username}`,
  });
  if (!chat) return { status: "unavailable" };
  if (
    !Number.isSafeInteger(chat.id) ||
    (chat.type !== "group" && chat.type !== "supergroup")
  ) {
    return { status: "invalid" };
  }

  const member = await telegramCall<TelegramCommunityMember>("getChatMember", {
    chat_id: chat.id,
    user_id: telegramUserId,
  });
  if (!member) return { status: "unavailable" };

  if (!isTelegramChatMember(member)) return { status: "not_member" };

  return {
    status: "verified",
    chatId: String(chat.id),
    title: chat.title?.trim() || chat.username || `@${username}`,
  };
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  inlineKeyboard?: TelegramButton[][],
) {
  const numericChatId = Number(chatId);
  if (!Number.isSafeInteger(numericChatId) || numericChatId === 0) return null;
  const compatibleKeyboard = makeChatCompatibleKeyboard(numericChatId, inlineKeyboard);
  return telegramCall<{ message_id: number }>("sendMessage", {
    chat_id: numericChatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: compatibleKeyboard ? { inline_keyboard: compatibleKeyboard } : undefined,
  });
}

export async function sendExperienceJoinedNotification(
  recipientTelegramId: number | string,
  experience: TelegramExperienceNotice,
) {
  return sendTelegramMessage(
    recipientTelegramId,
    formatExperienceJoinedNotice(experience),
    [[openButton("View experience", `/?screen=experience&id=${experience.id}`)]],
  );
}

export async function sendHostNewParticipantNotification(
  hostTelegramId: number | string,
  participantName: string,
  experience: TelegramExperienceNotice,
) {
  return sendTelegramMessage(
    hostTelegramId,
    formatHostNewParticipantNotice(participantName, experience),
    [[openButton("Review participants", "/?screen=host")]],
  );
}

export async function sendCompletionSubmittedNotification(
  hostTelegramId: number | string,
  participantName: string,
  experience: TelegramExperienceNotice,
) {
  return sendTelegramMessage(
    hostTelegramId,
    formatCompletionSubmittedNotice(participantName, experience),
    [[openButton("Review contribution", "/?screen=host")]],
  );
}

export async function sendMilestoneSubmittedNotification(
  hostTelegramId: number | string,
  participantName: string,
  experience: TelegramExperienceNotice,
  milestoneTitle: string,
) {
  return sendTelegramMessage(
    hostTelegramId,
    `${participantName} submitted the “${milestoneTitle}” milestone for “${experience.title}”.`,
    [[openButton("Review milestone", "/?screen=host")]],
  );
}

export async function sendContributionVerifiedNotification(
  participantTelegramId: number | string,
  experience: TelegramExperienceNotice,
) {
  return sendTelegramMessage(
    participantTelegramId,
    formatContributionVerifiedNotice(experience),
    [[openButton("View profile", "/?screen=profile"), openButton("Find another experience", "/?screen=explore")]],
  );
}

export async function sendContributionRejectedNotification(
  participantTelegramId: number | string,
  experience: TelegramExperienceNotice,
) {
  return sendTelegramMessage(
    participantTelegramId,
    formatContributionRejectedNotice(experience),
    [[openButton("View experience", `/?screen=experience&id=${experience.id}`)]],
  );
}

export async function sendFriendRequestSentNotification(
  requesterTelegramId: number | string,
  recipientName: string,
  recipientUsername: string | null,
) {
  return sendTelegramMessage(
    requesterTelegramId,
    formatFriendRequestSentNotice(recipientName, recipientUsername),
    [[openButton("Open friends", "/?screen=friends")]],
  );
}

export async function sendFriendRequestAcceptedNotification(
  requesterTelegramId: number | string,
  recipientName: string,
  recipientUsername: string | null,
) {
  return sendTelegramMessage(
    requesterTelegramId,
    formatFriendRequestAcceptedNotice(recipientName, recipientUsername),
    [[openButton("Open friends", "/?screen=friends")]],
  );
}

export async function sendFriendshipConnectedNotification(
  recipientTelegramId: number | string,
  requesterName: string,
  requesterUsername: string | null,
) {
  return sendTelegramMessage(
    recipientTelegramId,
    formatFriendshipConnectedNotice(requesterName, requesterUsername),
    [[openButton("Open friends", "/?screen=friends")]],
  );
}

export async function sendAccountabilityInvitationNotification(recipientTelegramId: number | string) {
  return sendTelegramMessage(
    recipientTelegramId,
    "You have a new accountability partner invitation waiting in Experiences.fun.",
    [[openButton("Review partner invitation", "/?screen=friends")]],
  );
}

export async function sendFriendRequestDeclinedNotification(
  requesterTelegramId: number | string,
  recipientName: string,
  recipientUsername: string | null,
) {
  return sendTelegramMessage(
    requesterTelegramId,
    formatFriendRequestDeclinedNotice(recipientName, recipientUsername),
    [[openButton("Open friends", "/?screen=friends")]],
  );
}

export async function sendFriendRequestNotification(
  recipientTelegramId: number | string,
  requesterName: string,
  requesterUsername: string | null,
  requestId: number,
) {
  return sendTelegramMessage(
    recipientTelegramId,
    formatFriendRequestNotice(requesterName, requesterUsername),
    [[
      { text: "Accept", callback_data: `friend:accept:${requestId}` },
      { text: "Decline", callback_data: `friend:decline:${requestId}` },
    ], [openButton("Open friends", "/?screen=friends")]],
  );
}

export async function getTelegramBotUsername(): Promise<string | null> {
  if (botUsername) return botUsername;
  const me = await telegramCall<{ id?: number; username?: string }>("getMe", {});
  botUsername = me?.username ?? null;
  if (me?.id && Number.isSafeInteger(me.id)) botTelegramId = me.id;
  return botUsername;
}

async function answerCallback(id: string) {
  await telegramCall("answerCallbackQuery", { callback_query_id: id });
}

async function registerTelegramCommands() {
  if (!telegramPollingLease) return;
  const registrations = await Promise.all([
    telegramCall<boolean>("setMyCommands", { commands: botCommands }),
    telegramCall<boolean>("setMyCommands", {
      commands: privateBotCommands,
      scope: { type: "all_private_chats" },
    }),
    telegramCall<boolean>("setMyCommands", {
      commands: groupBotCommands,
      scope: { type: "all_group_chats" },
    }),
  ]);
  if (registrations.some((registered) => !registered) && botRunning) {
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

function hasCompletedOnboarding(user: {
  city: string | null;
  interests: string[];
  participationType: string | null;
}): boolean {
  return Boolean(user.city?.trim() && user.interests.length > 0 && user.participationType);
}

function menuKeyboard(groupChat: boolean): TelegramButton[][] {
  if (groupChat) {
    return [
      [openButton("Open Experiences.fun", "/?screen=home")],
      [openButton("Explore", "/?screen=explore")],
    ];
  }

  return [
    [openButton("Open Experiences.fun", "/?screen=home")],
    [
      openButton("Explore", "/?screen=explore"),
      openButton("Community XP and profile", "/?screen=profile"),
    ],
    [openButton("Accountability partners", "/?screen=friends")],
    [
      openButton("Create experience", "/?screen=create"),
      openButton("Host tools", "/?screen=host"),
    ],
    [callbackButton("How it works", "onboarding:how")],
  ];
}

async function sendOnboarding(chatId: number) {
  const welcomeKeyboard = buildWelcomeKeyboard(miniAppUrl);
  const keyboard = chatId < 0
    ? welcomeKeyboard.filter((row) => row.every((button) => button.text !== "Profile"))
    : [
        ...welcomeKeyboard,
        [openButton("Accountability partners", "/?screen=friends")],
      ];
  return sendTelegramMessage(
    chatId,
    formatWelcomeMessage(),
    keyboard,
  );
}

async function sendHowItWorks(chatId: number) {
  return sendTelegramMessage(
    chatId,
    `<b>How Experiences.fun works</b>\n\n1️⃣ <b>Build your passport</b>\nAdd your location, interests, and how you want to take part.\n\n2️⃣ <b>Find your next good thing</b>\nBrowse nearby community, education, and environmental experiences.\n\n3️⃣ <b>Show up with good people</b>\nJoin an experience, contribute together, and make a visible difference.\n\n4️⃣ <b>Get your impact recognised</b>\nHosts verify your contribution so you can build Experience XP and collect any available reward.\n\n<b>Have something to share?</b>\nCreate an experience and invite your community to join you.`,
    [
      [openButton("Start setup", "/?screen=home")],
      [callbackButton("Back to menu", "menu:open")],
    ],
  );
}

async function sendCommandMenu(chatId: number) {
  const groupChat = Number(chatId) < 0;
  return sendTelegramMessage(
    chatId,
    groupChat
      ? `<b>Experiences.fun · Group commands</b>\n\n<code>/start</code> Welcome and quick actions\n<code>/experiences</code> Browse upcoming experiences\n<code>/rank</code> Your Community XP rank · add <code>@username</code> to look up a member\n<code>/leaderboard</code> Top contributors in this group\n<code>/riddle</code> Start a random riddle; answer within 15 minutes\n\n<b>Group controls · organisation owner + Telegram admin</b>\n<code>/community</code> Connect or view controls · <code>/community disconnect</code> Unlink\n<code>/spam on</code> / <code>/spam off</code> Toggle phrase protection\n<code>/filter add phrase</code> / <code>/filter remove phrase</code>\n<code>/filters</code> List saved phrases\n\nManage linked groups from a private chat with @${escapeTelegramHtml(botUsername ?? "experiencesdotfun_bot")} using <code>/community</code>.\n\n<code>/help</code> Show this guide\n\nFor private profile, XP, and friend commands, open a private chat with @${escapeTelegramHtml(botUsername ?? "experiencesdotfun_bot")}.`
        : `<b>Experiences.fun · Quick menu</b>\n\nChoose where to start:\n\n1️⃣ <b>Discover</b>\n<code>/experiences</code> Browse upcoming experiences\n\n2️⃣ <b>Track your XP</b>\n<code>/xp</code> Experience XP and rewards\n\n3️⃣ <b>Your community</b>\n<code>/rank</code> Your rank · <code>/leaderboard</code> Group leaders\n<code>/community</code> Manage groups you own\n<code>/riddle</code> Play a riddle here or in a group\n\n4️⃣ <b>Connect and host</b>\n<code>/profile</code> Passport · <code>/add @username</code> Friends · <code>/friends</code> List · <code>/requests</code> Requests · <code>/accountability</code> Partner space · <code>/create</code> Create · <code>/host</code> Manage\n\nNeed more help? Use <code>/help</code> or <code>/onboarding</code>.`,
    menuKeyboard(groupChat),
  );
}

async function handleCommand(
  chatId: number,
  chatType: string | undefined,
  identity: TelegramIdentity,
  text: string,
  chatTitle?: string,
) {
  const parsedCommand = parseTelegramCommand(text, botUsername);
  if (!parsedCommand) return;
  const { command, args } = parsedCommand;
  const user = await upsertTelegramUser(identity);
  let socialInviteClaim: Awaited<ReturnType<typeof claimSocialInvite>> | null = null;
  if (command === "/start" && chatType === "private" && args[0]?.startsWith("invite_")) {
    try {
      socialInviteClaim = await claimSocialInvite(args[0].slice("invite_".length), user);
    } catch (inviteError) {
      // An invite must never prevent Telegram signup or the normal welcome flow.
      logger.warn({ err: inviteError }, "Social invite claim failed");
    }
  }
  const privateCommands = new Set(["/onboarding", "/create", "/xp", "/progress", "/profile", "/friends", "/requests", "/add", "/addfriend", "/accountability", "/host"]);
  if (chatType !== "private" && privateCommands.has(command)) {
    await sendTelegramMessage(chatId, "For your privacy, use this command in a private chat with the Experiences.fun bot.");
    return;
  }
  if (groupOnlyCommandNames.has(command) && !isGroupChat(chatType)) {
    await sendTelegramMessage(
      chatId,
      chatType === "private"
        ? "Use <code>/community</code> in this private chat to manage your linked groups. This command also works inside its Telegram group."
        : "Use this community control inside the Telegram group you want to manage.",
    );
    return;
  }
  switch (command) {
    case "/start":
      await sendOnboarding(chatId);
      if (chatType === "private" && args[0]?.startsWith("community")) {
        const selectedGroup = /^community_(-?\d{1,20})$/.exec(args[0]);
        await runCommunityControlsSafely(chatId, "private_community_start", async () => {
          if (selectedGroup && Number.isSafeInteger(Number(selectedGroup[1])) && Number(selectedGroup[1]) < 0) {
            await showPrivateCommunityControls(chatId, Number(selectedGroup[1]), identity);
          } else {
            await sendPrivateCommunityList(chatId, identity);
          }
        });
      }
      if (socialInviteClaim?.outcome === "created") {
        await sendTelegramMessage(
          chatId,
          formatFriendRequestNotice(socialInviteClaim.inviter.name, socialInviteClaim.inviter.username),
          [[openButton("Review friend request", "/?screen=friends")]],
        );
      }
      break;
    case "/onboarding":
      await sendTelegramMessage(
        chatId,
        hasCompletedOnboarding(user)
          ? `<b>✅ Your passport is ready</b>\n\nYou can update your details any time in the Mini App, or jump straight into exploring experiences.`
          : `<b>🧩 Finish your passport</b>\n\nAdd your name, interests, city, and participation preference so we can show you experiences that feel relevant to you.`,
        [
          [openButton(hasCompletedOnboarding(user) ? "Update profile" : "Complete setup", "/?screen=home")],
          [callbackButton("How it works", "onboarding:how"), callbackButton("Open menu", "menu:open")],
        ],
      );
      break;
    case "/menu":
      await sendCommandMenu(chatId);
      break;
    case "/riddle":
      await handleRiddleCommand(chatId, chatType);
      break;
    case "/community":
      await runCommunityControlsSafely(chatId, "community", () =>
        handleCommunityCommand(
          chatId,
          chatType,
          chatTitle ?? "Telegram community",
          identity,
          args,
        ),
      );
      break;
    case "/spam":
      await runCommunityControlsSafely(chatId, "spam_protection", () =>
        handleSpamCommand(chatId, identity, args),
      );
      break;
    case "/filter":
      await runCommunityControlsSafely(chatId, "keyword_filter", () =>
        handleFilterCommand(chatId, identity, args),
      );
      break;
    case "/filters":
      await runCommunityControlsSafely(chatId, "list_filters", () =>
        handleFiltersCommand(chatId, identity),
      );
      break;
    case "/help":
      const groupChat = isGroupChat(chatType);
      await sendTelegramMessage(
        chatId,
        groupChat
           ? `<b>Experiences.fun · Group commands</b>\n\n<code>/start</code> Welcome · <code>/menu</code> Quick actions · <code>/help</code> This guide\n\n<b>Discover</b>\n<code>/experiences</code> Browse upcoming experiences\n\n<b>Community XP</b>\n<code>/rank</code> Your rank · <code>/rank @username</code> Member rank · <code>/leaderboard</code> Group leaders\n\n<b>Group game</b>\n<code>/riddle</code> Start a random riddle; reply within 15 minutes or the answer is revealed\n\n<b>Spam controls · organisation owner + Telegram admin</b>\n<code>/community</code> Connect or view group controls · <code>/community disconnect</code> Unlink\n<code>/spam on</code> / <code>/spam off</code> Toggle phrase protection\n<code>/filter add phrase</code> / <code>/filter remove phrase</code> · <code>/filters</code> List rules\n\nManage linked groups privately with <code>/community</code>. Profile, XP, friend, and host commands are also private. Open @${escapeTelegramHtml(botUsername ?? "experiencesdotfun_bot")} to use them.`
            : `<b>Experiences.fun · Commands</b>\n\n1️⃣ <b>Start</b>\n<code>/start</code> Welcome · <code>/menu</code> Quick actions · <code>/onboarding</code> Finish setup\n\n2️⃣ <b>Discover and track</b>\n<code>/experiences</code> Browse · <code>/xp</code> Experience XP and rewards\n\n3️⃣ <b>Community and games</b>\n<code>/rank</code> Your rank · <code>/rank @username</code> Member rank · <code>/leaderboard</code> Group leaders\n<code>/community</code> Manage linked groups privately\n<code>/riddle</code> Start a riddle in this chat or a group; answer within 15 minutes\n\n4️⃣ <b>Connect</b>\n<code>/profile</code> Passport · <code>/add @username</code> Add a friend · <code>/friends</code> Friends · <code>/requests</code> Requests · <code>/accountability</code> Partner space\n\n5️⃣ <b>Host</b>\n<code>/create</code> Create an experience · <code>/host</code> Host tools\n\nUse <code>/help</code> to open this guide.`,
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
      const [recent, pendingAwards] = await Promise.all([
        db
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
          .limit(5),
        db
          .select({
            title: xpAwardsTable.sourceTitle,
            amount: xpAwardsTable.amount,
          })
          .from(xpAwardsTable)
          .where(
            and(
              eq(xpAwardsTable.userId, user.id),
              eq(xpAwardsTable.status, "pending"),
            ),
          )
          .orderBy(desc(xpAwardsTable.awardedAt)),
      ]);
      const pendingXp = pendingAwards.reduce((sum, award) => sum + award.amount, 0);
      const sources = recent.length
        ? `\n\n<b>Recent verified experiences</b>\n${recent.map(({ experience }) => `+${experience.xpReward} XP · ${escapeTelegramHtml(experience.title)}`).join("\n")}`
        : "\n\nComplete and verify an experience to start earning XP.";
      const pendingSummary = pendingXp > 0
        ? `\n\n<b>Ready to redeem · ${pendingXp} XP</b>\n${pendingAwards.slice(0, 5).map((award) => `+${award.amount} XP · ${escapeTelegramHtml(award.title)}`).join("\n")}`
        : "";
      await sendTelegramMessage(
        chatId,
        `<b>⚡ Your Experience XP</b>\n\n<b>${profile.xp} XP in your profile</b> · ${escapeTelegramHtml(profile.level)}\n${profile.completedCount} experiences completed\n${profile.hostedCount} experiences hosted\n£${(profile.rewardsPence / 100).toFixed(2)} rewards earned${pendingSummary}${sources}\n\nCommunity XP is separate for each group. Use <code>/rank</code> in a community group.`,
        [[openButton("View XP history", "/?screen=profile")]],
      );
      break;
    }
    case "/rank": {
      if (chatType !== "group" && chatType !== "supergroup") {
        await sendTelegramMessage(chatId, "Use <code>/rank</code> inside the Telegram group you want to check.");
        break;
      }

      const targetUsername = args[0]?.replace(/^@/, "");
      const target = targetUsername
        ? await getCommunityMemberByUsername(String(chatId), targetUsername)
        : null;
      if (targetUsername && !target) {
        await sendTelegramMessage(chatId, `I couldn't find @${escapeTelegramHtml(targetUsername)} with Community XP in this group.`);
        break;
      }

      const current = target?.community ?? await getCommunityMemberSummary(String(chatId), user.id);
      if (!current) {
        await sendTelegramMessage(
          chatId,
          target
            ? `${escapeTelegramHtml(target.user.name)} hasn't earned Community XP in this group yet.`
            : "You haven't earned Community XP in this group yet. Send a thoughtful message of at least seven words to get started.",
        );
        break;
      }
      const displayName = target
        ? target.user.username
          ? `@${target.user.username}`
          : target.user.name
        : user.username
          ? `@${user.username}`
          : user.name;
      const progressPercent = Math.max(0, Math.min(100, Math.round(current.levelProgress)));
      const filledSegments = Math.round(progressPercent / 10);
      const progressBar = `${"■".repeat(filledSegments)}${"□".repeat(10 - filledSegments)}`;
      const progressLabel = current.nextLevelXp === null
        ? "<i>Maximum level reached</i>"
        : `<code>${progressBar}</code> ${progressPercent}% to next level · ${formatCommunityXp(current.nextLevelXp)} XP`;
      await sendTelegramMessage(
        chatId,
        `<b>Community rank</b>\n<i>${escapeTelegramHtml(current.title)}</i>\n\n<b>${escapeTelegramHtml(displayName)}</b>\n<b>#${current.rank} · ${formatCommunityXp(current.communityXp)} Community XP</b>\n${escapeTelegramHtml(current.level)}\n${progressLabel}\n\n${current.qualifyingMessages} qualifying message${current.qualifyingMessages === 1 ? "" : "s"} · ${current.contributionCount} contributions`,
      );
      break;
    }
    case "/leaderboard": {
      if (chatType !== "group" && chatType !== "supergroup") {
        await sendTelegramMessage(chatId, "Use <code>/leaderboard</code> inside a Telegram group.");
        break;
      }
      const leaderboard = await getCommunityLeaderboard(String(chatId), user.id);
      const currentSummary = leaderboard.some((member) => member.isCurrentUser)
        ? null
        : await getCommunityMemberSummary(String(chatId), user.id);
      const currentRow = currentSummary
        ? {
            rank: currentSummary.rank,
            name: user.name,
            username: user.username,
            communityXp: currentSummary.communityXp,
            qualifyingMessages: currentSummary.qualifyingMessages,
            level: currentSummary.level,
            isCurrentUser: true,
          }
        : null;
      const visibleLeaderboard = currentRow ? [...leaderboard, currentRow] : leaderboard;
      if (!visibleLeaderboard.length) {
        await sendTelegramMessage(chatId, "This group has no Community XP yet. Start with a thoughtful message of at least seven words.");
        break;
      }
      const rows = visibleLeaderboard.map((member) => {
        const label = member.username
          ? `@${member.username}`
          : member.name;
        const userTag = member.isCurrentUser ? " <b>YOU</b>" : "";
        const yourPlace = member.isCurrentUser && member.rank > leaderboard.length
          ? "<i>YOUR PLACE</i>\n"
          : "";
        const messageLabel = member.qualifyingMessages === 1 ? "message" : "messages";
        return `${yourPlace}${rankNumber(member.rank)} <b>${escapeTelegramHtml(label)}</b>${userTag} · <b>${formatCommunityXp(member.communityXp)} XP</b>\n    ${escapeTelegramHtml(member.level)} · ${member.qualifyingMessages} qualifying ${messageLabel}`;
      });
      await sendTelegramMessage(
        chatId,
        `<b>Community leaderboard</b>\n<i>Top contributors in this group</i>\n\n${rows.join("\n\n")}`,
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
    case "/accountability":
      await sendTelegramMessage(
        chatId,
        "<b>Accountability partners</b>\n\nInvite a friend, respond to invitations, and manage shared commitments and check-ins in Experiences.fun.",
        [[openButton("Open accountability", "/?screen=friends")]],
      );
      break;
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
          await sendFriendRequestNotification(
            chatId,
            row.user.name,
            row.user.username,
            row.friendship.id,
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
      await sendFriendRequestSentNotification(chatId, friend.name, friend.username);
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

function isGroupChat(chatType: string | undefined): boolean {
  return chatType === "group" || chatType === "supergroup";
}

function clearRiddleRevealTimer(chatId: number, messageId?: number): void {
  const scheduled = riddleRevealTimers.get(chatId);
  if (!scheduled || (messageId !== undefined && scheduled.messageId !== messageId)) return;
  clearTimeout(scheduled.timer);
  riddleRevealTimers.delete(chatId);
}

async function sendRiddleAnswerReveal(chatId: number, answer: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `⏰ <b>Time’s up!</b> The answer was <b>${escapeTelegramHtml(answer)}</b>. Use /riddle to try another.`,
  );
}

function scheduleRiddleAnswerReveal(chatId: number, messageId: number): void {
  const timer = setTimeout(() => {
    const scheduled = riddleRevealTimers.get(chatId);
    if (!scheduled || scheduled.messageId !== messageId) return;
    riddleRevealTimers.delete(chatId);
    const round = riddleRounds.reveal(chatId, messageId);
    if (round) void sendRiddleAnswerReveal(chatId, round.riddle.answers[0]);
  }, RIDDLE_REVEAL_AFTER_MS);
  riddleRevealTimers.set(chatId, { messageId, timer });
}

async function revealExpiredRiddle(chatId: number, now = Date.now()): Promise<void> {
  const round = riddleRounds.revealExpired(chatId, now);
  if (!round) return;
  clearRiddleRevealTimer(chatId, round.messageId);
  await sendRiddleAnswerReveal(chatId, round.riddle.answers[0]);
}

async function handleRiddleCommand(
  chatId: number,
  chatType: string | undefined,
): Promise<void> {
  if (chatType !== "private" && !isGroupChat(chatType)) {
    await sendTelegramMessage(chatId, "Start a riddle in a private chat or Telegram group with /riddle.");
    return;
  }

  await revealExpiredRiddle(chatId);
  if (riddleRounds.getActive(chatId)) {
    await sendTelegramMessage(
      chatId,
      "There’s already a riddle open. Reply to that message within 15 minutes before starting another.",
    );
    return;
  }

  const riddle = chooseGroupRiddle();
  const heading = chatType === "private" ? "Your riddle" : "Group riddle";
  const sentMessage = await sendTelegramMessage(
    chatId,
    `🧩 <b>${heading}</b>\n\n${escapeTelegramHtml(riddle.question)}\n\nReply directly to this message with your answer. The first correct answer solves it; otherwise, the answer is revealed after 15 minutes.`,
  );
  if (!sentMessage || !Number.isSafeInteger(sentMessage.message_id)) {
    logger.warn({ chatId, riddleId: riddle.id }, "Group riddle message could not be posted");
    return;
  }

  const startedAt = Date.now();
  if (!riddleRounds.start(chatId, sentMessage.message_id, riddle, startedAt)) {
    logger.warn({ chatId, messageId: sentMessage.message_id }, "Group riddle round could not be activated");
    return;
  }
  scheduleRiddleAnswerReveal(chatId, sentMessage.message_id);
}

async function handleRiddleReply(
  message: NonNullable<TelegramUpdate["message"]>,
  identity: TelegramIdentity,
  answer: string,
): Promise<boolean> {
  const solvedRiddle = riddleRounds.solve(
    message.chat.id,
    message.reply_to_message?.message_id ?? 0,
    answer,
  );
  if (!solvedRiddle) {
    await revealExpiredRiddle(message.chat.id);
    return false;
  }
  clearRiddleRevealTimer(message.chat.id, message.reply_to_message?.message_id);

  const memberName = identity.username
    ? `@${identity.username}`
    : [identity.first_name, identity.last_name].filter(Boolean).join(" ") || "A group member";
  await sendTelegramMessage(
    message.chat.id,
    `🎉 <b>Riddle solved!</b> ${escapeTelegramHtml(memberName)} got it right. The answer was <b>${escapeTelegramHtml(solvedRiddle.answers[0])}</b>.`,
  );
  return true;
}

async function isTelegramChatAdmin(chatId: number, telegramUserId: number): Promise<boolean> {
  const member = await telegramCall<{ status?: string }>("getChatMember", {
    chat_id: chatId,
    user_id: telegramUserId,
  });
  return member?.status === "creator" || member?.status === "administrator";
}

async function botCanDeleteMessages(chatId: number): Promise<boolean> {
  if (!botTelegramId) {
    const bot = await telegramCall<{ id?: number }>("getMe", {});
    if (!bot?.id || !Number.isSafeInteger(bot.id)) return false;
    botTelegramId = bot.id;
  }
  const botMember = await telegramCall<{
    status?: string;
    can_delete_messages?: boolean;
  }>("getChatMember", {
    chat_id: chatId,
    user_id: botTelegramId,
  });
  return botMember?.status === "creator" || (
    botMember?.status === "administrator" && botMember.can_delete_messages === true
  );
}

export async function getTelegramCommunityLiveInfo(chatId: string) {
  const numericChatId = Number(chatId);
  const unavailable = {
    chatId,
    chatTitle: "Telegram group",
    description: null,
    connectionStatus: "error" as const,
    connectionMessage: "Telegram could not verify this group right now. Try again shortly.",
    memberCount: null,
    botCanDeleteMessages: null,
  };
  if (!Number.isSafeInteger(numericChatId) || numericChatId >= 0) return unavailable;

  const [chat, memberCount] = await Promise.all([
    telegramCall<TelegramCommunityChat & { description?: string }>("getChat", {
      chat_id: numericChatId,
    }),
    telegramCall<number>("getChatMemberCount", { chat_id: numericChatId }),
  ]);
  if (!chat || !isGroupChat(chat.type)) return unavailable;

  if (!botTelegramId) {
    const bot = await telegramCall<{ id?: number }>("getMe", {});
    if (!bot?.id || !Number.isSafeInteger(bot.id)) {
      return {
        ...unavailable,
        chatTitle: chat.title?.trim() || "Telegram group",
        description: chat.description?.trim() || null,
      };
    }
    botTelegramId = bot.id;
  }

  const botMember = await telegramCall<{
    status?: string;
    is_member?: boolean;
    can_delete_messages?: boolean;
  }>("getChatMember", {
    chat_id: numericChatId,
    user_id: botTelegramId,
  });
  const chatTitle = chat.title?.trim() || "Telegram group";
  const description = chat.description?.trim() || null;
  const safeMemberCount = Number.isSafeInteger(memberCount) && Number(memberCount) >= 0
    ? Number(memberCount)
    : null;

  if (!botMember) {
    return {
      chatId,
      chatTitle,
      description,
      connectionStatus: "error" as const,
      connectionMessage: "Telegram could not confirm the bot’s group permissions.",
      memberCount: safeMemberCount,
      botCanDeleteMessages: null,
    };
  }
  if (botMember.status === "left" || botMember.status === "kicked" || botMember.is_member === false) {
    return {
      chatId,
      chatTitle,
      description,
      connectionStatus: "disconnected" as const,
      connectionMessage: "The Experiences.fun bot is no longer a member of this group.",
      memberCount: safeMemberCount,
      botCanDeleteMessages: false,
    };
  }

  const isAdmin = botMember.status === "creator" || botMember.status === "administrator";
  const canDeleteMessages = botMember.status === "creator"
    || (botMember.status === "administrator" && botMember.can_delete_messages === true);
  const connectionStatus = isAdmin && canDeleteMessages ? "connected" as const : "permission_issue" as const;
  return {
    chatId,
    chatTitle,
    description,
    connectionStatus,
    connectionMessage: connectionStatus === "connected"
      ? null
      : "Make the Experiences.fun bot a group admin with permission to delete messages.",
    memberCount: safeMemberCount,
    botCanDeleteMessages: canDeleteMessages,
  };
}

async function runCommunityControlsSafely(
  chatId: number,
  action: string,
  run: () => Promise<void>,
) {
  try {
    await run();
  } catch (error) {
    logger.error({ err: error, chatId, action }, "Telegram community control failed");
    await sendTelegramMessage(
      chatId,
      "Community controls are temporarily unavailable. Existing community XP commands are unaffected.",
    );
  }
}

async function handleCommunityCommand(
  chatId: number,
  chatType: string | undefined,
  chatTitle: string,
  identity: TelegramIdentity,
  args: string[],
) {
  if (chatType === "private") {
    if (args.length) {
      await sendTelegramMessage(
        chatId,
        "Use <code>/community</code> to open your linked-group controls, then choose a group to manage it here.",
      );
      return;
    }
    await sendPrivateCommunityList(chatId, identity);
    return;
  }
  if (!isGroupChat(chatType)) {
    await sendTelegramMessage(chatId, "Use /community in a group or in a private chat with the bot.");
    return;
  }

  const action = args[0]?.toLowerCase();
  if (args.length > 1 || (action && action !== "disconnect")) {
    await sendTelegramMessage(
      chatId,
      "Use <code>/community</code> to view or connect this group, or <code>/community disconnect</code> to unlink it.",
    );
    return;
  }
  if (action === "disconnect") {
    const context = await requireTelegramCommunityOwner(chatId, identity);
    if (!context) return;
    await sendTelegramMessage(
      chatId,
      `<b>Disconnect ${escapeTelegramHtml(context.chatTitle)}?</b>\n\nPhrase and link protection will stop, and this group's saved phrase filters and whitelisted links will be permanently deleted. Community XP history will be kept.`,
      [[
        callbackButton("Disconnect group", "community:disconnect:confirm"),
        callbackButton("Cancel", "community:disconnect:cancel"),
      ]],
    );
    return;
  }

  const existing = await getTelegramCommunity(String(chatId));
  if (existing) {
    await sendTelegramMessage(
      chatId,
      `<b>${escapeTelegramHtml(existing.chatTitle)}</b>\nConnected to <b>${escapeTelegramHtml(existing.organisationName)}</b>\nPhrase protection: <b>${existing.spamProtectionEnabled ? "ON" : "OFF"}</b>\n\nOnly the linked organisation owner who is also a Telegram group admin can change settings.\n\n<code>/spam on</code> / <code>/spam off</code>\n<code>/filter add phrase</code> · <code>/filter remove phrase</code> · <code>/filters</code>\n<code>/community disconnect</code> Unlink this group\n\nYou can manage linked groups privately by opening the bot and running <code>/community</code>.\n\nThis first version removes exact-word or exact-phrase matches only. It does not detect floods or suspicious links.`,
    );
    return;
  }

  if (!(await isTelegramChatAdmin(chatId, identity.id))) {
    await sendTelegramMessage(chatId, "A Telegram group admin must connect this group.");
    return;
  }
  if (!(await botCanDeleteMessages(chatId))) {
    await sendTelegramMessage(
      chatId,
      "To enable phrase protection, make the Experiences.fun bot a group admin with permission to delete messages, then run /community again.",
    );
    return;
  }

  const organisations = await listTelegramOwnedOrganisations(identity.id);
  if (!organisations.length) {
    await sendTelegramMessage(
      chatId,
      "No organisation owner profile is linked to this Telegram account. Open Experiences.fun using the same Telegram account and set up an organisation profile first.",
    );
    return;
  }
  const keyboard: TelegramButton[][] = organisations.map((organisation) => {
    const name = organisation.name.length > 48
      ? `${organisation.name.slice(0, 45)}...`
      : organisation.name;
    return [{
      text: `Connect ${name}`,
      callback_data: `community:connect:${organisation.id}`,
    }];
  });
  await sendTelegramMessage(
    chatId,
    `<b>Connect this group</b>\n\nChoose the organisation you own. The same Telegram account must be a group admin, and the Experiences.fun bot needs permission to delete messages.`,
    keyboard,
  );
}

const PRIVATE_COMMUNITY_PAGE_SIZE = 20;

function requestPrivateCommunityPhrase(telegramUserId: number, groupChatId: number) {
  const now = Date.now();
  for (const [userId, pending] of pendingPrivateCommunityPhrases) {
    if (pending.expiresAt <= now) pendingPrivateCommunityPhrases.delete(userId);
  }
  pendingPrivateCommunityPhrases.set(telegramUserId, {
    chatId: groupChatId,
    expiresAt: now + PRIVATE_COMMUNITY_PHRASE_TTL_MS,
  });
}

function parseGroupChatId(value: string | undefined): number | null {
  if (!value || !/^-?\d+$/.test(value)) return null;
  const chatId = Number(value);
  return Number.isSafeInteger(chatId) && chatId < 0 ? chatId : null;
}

async function sendPrivateCommunityList(
  privateChatId: number,
  identity: TelegramIdentity,
  page = 0,
) {
  const safePage = Math.max(0, Math.min(10_000, Math.floor(page)));
  const communities = await listTelegramOwnedCommunities(
    identity.id,
    PRIVATE_COMMUNITY_PAGE_SIZE + 1,
    safePage * PRIVATE_COMMUNITY_PAGE_SIZE,
  );
  const visible = communities.slice(0, PRIVATE_COMMUNITY_PAGE_SIZE);
  if (!visible.length && safePage === 0) {
    await sendTelegramMessage(
      privateChatId,
        "<b>Group management</b>\n\nYou do not have a linked Telegram group yet. Add the Experiences.fun bot to your group, make it an admin with permission to delete messages, and run <code>/community</code> there using the same Telegram account that owns your organisation profile. Then return here to manage phrase protection and filters.",
    );
    return;
  }
  if (!visible.length) {
    await sendTelegramMessage(
      privateChatId,
      "There are no more linked groups on this page.",
      [[callbackButton("Back to groups", "community:private:list:0")]],
    );
    return;
  }

  const keyboard: TelegramButton[][] = visible.map((community) => {
    const title = community.chatTitle.length > 34
      ? `${community.chatTitle.slice(0, 31)}...`
      : community.chatTitle;
    const organisation = community.organisationName.length > 20
      ? `${community.organisationName.slice(0, 17)}...`
      : community.organisationName;
    return [{
      text: `${title} · ${organisation}`,
      callback_data: `community:private:select:${community.chatId}`,
    }];
  });
  const navigation: TelegramButton[] = [];
  if (safePage > 0) {
    navigation.push(callbackButton("Previous", `community:private:list:${safePage - 1}`));
  }
  if (communities.length > PRIVATE_COMMUNITY_PAGE_SIZE) {
    navigation.push(callbackButton("Next", `community:private:list:${safePage + 1}`));
  }
  if (navigation.length) keyboard.push(navigation);

  await sendTelegramMessage(
    privateChatId,
    `<b>Your linked groups</b>\n\nChoose a group to manage phrase protection and saved filters. Group changes are available only while you remain both its Telegram admin and the linked organisation owner.`,
    keyboard,
  );
}

async function showPrivateCommunityControls(
  privateChatId: number,
  groupChatId: number,
  identity: TelegramIdentity,
) {
  const context = await requireTelegramCommunityOwner(groupChatId, identity, privateChatId);
  if (!context) return;

  const protectionAction = context.spamProtectionEnabled ? "off" : "on";
  const protectionLabel = context.spamProtectionEnabled
    ? "Turn phrase protection off"
    : "Turn phrase protection on";
  await sendTelegramMessage(
    privateChatId,
    `<b>${escapeTelegramHtml(context.chatTitle)}</b>\n${escapeTelegramHtml(context.organisationName)}\nPhrase protection: <b>${context.spamProtectionEnabled ? "ON" : "OFF"}</b>\n\nManage these settings privately. You must remain a Telegram group admin and the linked organisation owner.`,
    [
      [callbackButton(protectionLabel, `community:private:toggle:${groupChatId}:${protectionAction}`)],
      [
        callbackButton("Add phrase filter", `community:private:add:${groupChatId}`),
        callbackButton("View saved filters", `community:private:filters:${groupChatId}:0`),
      ],
      [
        callbackButton("Disconnect group", `community:private:disconnect:${groupChatId}`),
        callbackButton("All groups", "community:private:list:0"),
      ],
    ],
  );
}

async function showPrivateCommunityFilters(
  privateChatId: number,
  groupChatId: number,
  identity: TelegramIdentity,
  page = 0,
) {
  const context = await requireTelegramCommunityOwner(groupChatId, identity, privateChatId);
  if (!context) return;
  const safePage = Math.max(0, Math.min(10_000, Math.floor(page)));
  const rules = await listTelegramCommunityKeywordRules(
    String(groupChatId),
    PRIVATE_COMMUNITY_PAGE_SIZE + 1,
    safePage * PRIVATE_COMMUNITY_PAGE_SIZE,
  );
  const visibleRules = rules.slice(0, PRIVATE_COMMUNITY_PAGE_SIZE);
  if (!visibleRules.length && safePage === 0) {
    await sendTelegramMessage(
      privateChatId,
      `<b>No saved phrase filters</b>\n\n${escapeTelegramHtml(context.chatTitle)} has no filters yet. Add one to start building the list.`,
      [
        [callbackButton("Add phrase filter", `community:private:add:${groupChatId}`)],
        [callbackButton("Back to group controls", `community:private:select:${groupChatId}`)],
      ],
    );
    return;
  }
  if (!visibleRules.length) {
    await sendTelegramMessage(
      privateChatId,
      "There are no more filters on this page.",
      [[callbackButton("Back to filters", `community:private:filters:${groupChatId}:${safePage - 1}`)]],
    );
    return;
  }

  const keyboard: TelegramButton[][] = visibleRules.map((rule) => {
    const phrase = rule.phrase.length > 48 ? `${rule.phrase.slice(0, 45)}...` : rule.phrase;
    return [{
      text: `Remove · ${phrase}`,
      callback_data: `community:private:remove:${groupChatId}:${rule.id}:${safePage}`,
    }];
  });
  const navigation: TelegramButton[] = [];
  if (safePage > 0) {
    navigation.push(
      callbackButton("Previous", `community:private:filters:${groupChatId}:${safePage - 1}`),
    );
  }
  if (rules.length > PRIVATE_COMMUNITY_PAGE_SIZE) {
    navigation.push(
      callbackButton("Next", `community:private:filters:${groupChatId}:${safePage + 1}`),
    );
  }
  if (navigation.length) keyboard.push(navigation);
  keyboard.push([
    callbackButton("Add phrase", `community:private:add:${groupChatId}`),
    callbackButton("Group controls", `community:private:select:${groupChatId}`),
  ]);
  await sendTelegramMessage(
    privateChatId,
    `<b>Saved phrase filters</b> · ${escapeTelegramHtml(context.chatTitle)}\n\nProtection is <b>${context.spamProtectionEnabled ? "ON" : "OFF"}</b>. Select a filter to remove it.`,
    keyboard,
  );
}

function parsePrivateCommunityPage(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 10_000 ? page : null;
}

async function handlePrivateCommunityPhraseInput(
  privateChatId: number,
  groupChatId: number,
  identity: TelegramIdentity,
  phrase: string,
) {
  const context = await requireTelegramCommunityOwner(groupChatId, identity, privateChatId);
  if (!context) return;
  const result = await addTelegramCommunityKeywordRule({
    chatId: String(groupChatId),
    telegramUserId: identity.id,
    phrase,
  });
  if (result.status === "invalid_phrase") {
    requestPrivateCommunityPhrase(identity.id, groupChatId);
    await sendTelegramMessage(
      privateChatId,
      "That phrase is invalid. Send a phrase from 2–80 characters without control characters, or /cancel to stop.",
    );
    return;
  }
  if (result.status === "already_exists") {
    await sendTelegramMessage(
      privateChatId,
      "That exact-word or exact-phrase filter is already saved.",
    );
    await showPrivateCommunityFilters(privateChatId, groupChatId, identity);
    return;
  }
  if (result.status === "not_owner") {
    await sendTelegramMessage(
      privateChatId,
      "Your organisation access changed. Reopen /community and try again.",
    );
    return;
  }

  logger.info({
    chatId: groupChatId,
    organisationId: result.context.organisationId,
    actorUserId: result.context.ownerUserId,
    ruleId: result.ruleId,
  }, "Telegram community phrase filter added from private chat");
  await sendTelegramMessage(
    privateChatId,
    `Added filter <code>${escapeTelegramHtml(phrase)}</code>${result.context.spamProtectionEnabled ? ". It is active now." : ". It is saved but inactive until phrase protection is on."}`,
  );
  await showPrivateCommunityFilters(privateChatId, groupChatId, identity);
}

async function handlePrivateCommunityCallback(
  privateChatId: number,
  callback: string,
  identity: TelegramIdentity,
) {
  const [action, rawChatId, rawValue, rawPage] = callback
    .slice("community:private:".length)
    .split(":");
  if (action === "list") {
    const page = parsePrivateCommunityPage(rawChatId);
    if (page === null) {
      await sendTelegramMessage(privateChatId, "That group-list page is invalid. Use /community to reopen the list.");
      return;
    }
    await sendPrivateCommunityList(privateChatId, identity, page);
    return;
  }

  const groupChatId = parseGroupChatId(rawChatId);
  if (groupChatId === null) {
    await sendTelegramMessage(privateChatId, "That group selection is invalid. Use /community to reopen the list.");
    return;
  }

  if (action === "select") {
    await showPrivateCommunityControls(privateChatId, groupChatId, identity);
    return;
  }
  if (action === "toggle") {
    if (rawValue !== "on" && rawValue !== "off") {
      await sendTelegramMessage(privateChatId, "That protection setting is invalid. Reopen /community and try again.");
      return;
    }
    const context = await requireTelegramCommunityOwner(groupChatId, identity, privateChatId);
    if (!context) return;
    const enabled = rawValue === "on";
    if (enabled && !(await botCanDeleteMessages(groupChatId))) {
      await sendTelegramMessage(
        privateChatId,
        "Phrase protection was not enabled. Make the Experiences.fun bot a group admin with permission to delete messages, then try again.",
      );
      return;
    }
    const updated = await setTelegramCommunitySpamProtection({
      chatId: String(groupChatId),
      telegramUserId: identity.id,
      enabled,
    });
    if (!updated) {
      await sendTelegramMessage(
        privateChatId,
        "Your organisation access changed. Reopen /community and try again.",
      );
      return;
    }
    logger.info({
      chatId: groupChatId,
      organisationId: updated.organisationId,
      actorUserId: updated.ownerUserId,
      enabled,
    }, "Telegram community phrase protection updated from private chat");
    await sendTelegramMessage(
      privateChatId,
      `Phrase protection is now <b>${enabled ? "ON" : "OFF"}</b> for ${escapeTelegramHtml(updated.chatTitle)}.`,
    );
    await showPrivateCommunityControls(privateChatId, groupChatId, identity);
    return;
  }
  if (action === "add") {
    const context = await requireTelegramCommunityOwner(groupChatId, identity, privateChatId);
    if (!context) return;
    requestPrivateCommunityPhrase(identity.id, groupChatId);
    await sendTelegramMessage(
      privateChatId,
      `Send the phrase to save for <b>${escapeTelegramHtml(context.chatTitle)}</b> in your next message. Use 2–80 characters. Send /cancel to stop.`,
    );
    return;
  }
  if (action === "filters") {
    const page = parsePrivateCommunityPage(rawValue);
    if (page === null) {
      await sendTelegramMessage(privateChatId, "That filter-list page is invalid. Reopen the group's controls and try again.");
      return;
    }
    await showPrivateCommunityFilters(privateChatId, groupChatId, identity, page);
    return;
  }
  if (action === "remove") {
    const ruleId = Number(rawValue);
    const page = parsePrivateCommunityPage(rawPage);
    if (!Number.isSafeInteger(ruleId) || ruleId <= 0 || page === null) {
      await sendTelegramMessage(privateChatId, "That filter selection is invalid. Reopen the saved filters and try again.");
      return;
    }
    const context = await requireTelegramCommunityOwner(groupChatId, identity, privateChatId);
    if (!context) return;
    const result = await removeTelegramCommunityKeywordRuleById({
      chatId: String(groupChatId),
      telegramUserId: identity.id,
      ruleId,
    });
    if (result.status !== "removed") {
      await sendTelegramMessage(
        privateChatId,
        result.status === "not_found"
          ? "That saved filter is no longer available."
          : "Your organisation access changed. Reopen /community and try again.",
      );
    } else {
      logger.info({
        chatId: groupChatId,
        organisationId: result.context.organisationId,
        actorUserId: result.context.ownerUserId,
        ruleId: result.ruleId,
      }, "Telegram community phrase filter removed from private chat");
      await sendTelegramMessage(privateChatId, "Phrase filter removed.");
    }
    await showPrivateCommunityFilters(privateChatId, groupChatId, identity, page);
    return;
  }
  if (action === "disconnect") {
    const context = await requireTelegramCommunityOwner(groupChatId, identity, privateChatId);
    if (!context) return;
    await sendTelegramMessage(
      privateChatId,
      `<b>Disconnect ${escapeTelegramHtml(context.chatTitle)}?</b>\n\nPhrase and link protection will stop, and this group's saved phrase filters and whitelisted links will be permanently deleted. Community XP history will be kept.`,
      [[
        callbackButton("Disconnect group", `community:private:disconnect-confirm:${groupChatId}`),
        callbackButton("Cancel", `community:private:disconnect-cancel:${groupChatId}`),
      ]],
    );
    return;
  }
  if (action === "disconnect-confirm") {
    const disconnected = await handleCommunityDisconnectCallback(
      groupChatId,
      identity,
      privateChatId,
    );
    if (disconnected) await sendPrivateCommunityList(privateChatId, identity);
    return;
  }
  if (action === "disconnect-cancel") {
    await sendTelegramMessage(privateChatId, "Disconnect canceled. The group and its settings are unchanged.");
    await showPrivateCommunityControls(privateChatId, groupChatId, identity);
    return;
  }

  await sendTelegramMessage(privateChatId, "That group-management action is no longer available. Use /community to reopen the controls.");
}

async function handleCommunityConnectionCallback(
  chatId: number,
  chatTitle: string,
  identity: TelegramIdentity,
  organisationId: number,
) {
  if (!(await isTelegramChatAdmin(chatId, identity.id))) {
    await sendTelegramMessage(chatId, "Only a Telegram group admin can connect this group.");
    return;
  }
  if (!(await botCanDeleteMessages(chatId))) {
    await sendTelegramMessage(
      chatId,
      "The Experiences.fun bot needs group-admin permission to delete messages before this group can be connected.",
    );
    return;
  }
  const result = await connectTelegramCommunity({
    chatId: String(chatId),
    chatTitle,
    organisationId,
    telegramUserId: identity.id,
  });
  if (result.status === "not_owner") {
    await sendTelegramMessage(
      chatId,
      "That organisation is not linked to an organisation owner profile for your Telegram account.",
    );
    return;
  }
  if (result.status === "owned_by_another_organisation") {
    await sendTelegramMessage(
      chatId,
      "This group is already connected to a different organisation. Ask that organisation's owner to review the connection.",
    );
    return;
  }
  logger.info({
    chatId,
    organisationId,
    telegramUserId: identity.id,
    result: result.status,
  }, "Telegram community connected by its organisation owner");
  await sendTelegramMessage(
    chatId,
    result.status === "connected"
      ? `<b>Group connected</b>\n\nThis group is now linked to <b>${escapeTelegramHtml(result.organisationName)}</b>. Phrase protection is off by default. An owner who is also a group admin can enable it with <code>/spam on</code>. Edit banned phrases and whitelisted links from the app dashboard.`
      : `This group is already connected to <b>${escapeTelegramHtml(result.organisationName)}</b>.`,
  );
}

async function handleCommunityDisconnectCallback(
  chatId: number,
  identity: TelegramIdentity,
  responseChatId = chatId,
): Promise<boolean> {
  if (!(await isTelegramChatAdmin(chatId, identity.id))) {
    await sendTelegramMessage(
      responseChatId,
      "Only a Telegram group admin can disconnect this group.",
    );
    return false;
  }
  const context = await disconnectTelegramCommunity({
    chatId: String(chatId),
    telegramUserId: identity.id,
  });
  if (!context) {
    await sendTelegramMessage(
      responseChatId,
      "This group is no longer connected to an organisation you own. Run /community to check its current status.",
    );
    return false;
  }
  logger.warn({
    chatId,
    organisationId: context.organisationId,
    actorUserId: context.ownerUserId,
  }, "Telegram community disconnected by its organisation owner");
  await sendTelegramMessage(
    responseChatId,
    "<b>Group disconnected.</b>\n\nPhrase protection is off and saved phrase filters and whitelisted links for this group were deleted. Community XP history was kept.",
  );
  return true;
}

async function requireTelegramCommunityOwner(
  chatId: number,
  identity: TelegramIdentity,
  responseChatId = chatId,
) {
  if (!(await isTelegramChatAdmin(chatId, identity.id))) {
    await sendTelegramMessage(responseChatId, "A Telegram group admin must run this command.");
    return null;
  }
  const context = await getTelegramCommunityManagementContext(String(chatId), identity.id);
  if (!context) {
    const community = await getTelegramCommunity(String(chatId));
    await sendTelegramMessage(
      responseChatId,
      community
        ? "Only the organisation owner linked to this group can change its settings. Telegram group-admin status alone is not enough."
        : "This group is not connected yet. A Telegram group admin can start with /community.",
    );
    return null;
  }
  return context;
}

async function handleSpamCommand(
  chatId: number,
  identity: TelegramIdentity,
  args: string[],
) {
  const setting = args[0]?.toLowerCase();
  if (setting !== "on" && setting !== "off") {
    const community = await getTelegramCommunity(String(chatId));
    await sendTelegramMessage(
      chatId,
      community
        ? `Phrase protection is <b>${community.spamProtectionEnabled ? "ON" : "OFF"}</b>.\nUse <code>/spam on</code> or <code>/spam off</code>. Only the linked organisation owner who is also a Telegram group admin can change it.`
        : "This group is not connected. A Telegram group admin can start with /community.",
    );
    return;
  }

  const context = await requireTelegramCommunityOwner(chatId, identity);
  if (!context) return;
  const enabled = setting === "on";
  if (enabled && !(await botCanDeleteMessages(chatId))) {
    await sendTelegramMessage(
      chatId,
      "Phrase protection was not enabled. Make the Experiences.fun bot a group admin with permission to delete messages, then try again.",
    );
    return;
  }

  const updated = await setTelegramCommunitySpamProtection({
    chatId: String(chatId),
    telegramUserId: identity.id,
    enabled,
  });
  if (!updated) {
    await sendTelegramMessage(chatId, "Your organisation access changed. Reopen /community and try again.");
    return;
  }
  logger.info({
    chatId,
    organisationId: updated.organisationId,
    actorUserId: updated.ownerUserId,
    enabled,
  }, "Telegram community phrase protection updated");
  await sendTelegramMessage(
    chatId,
    enabled
      ? "<b>Phrase protection is on.</b>\n\nSaved phrase filters are removed automatically. If the dashboard has at least one whitelisted link, messages with other links are removed too. Message floods are not detected."
      : "<b>Phrase protection is off.</b>\n\nYour saved phrase filters and link list remain available and can be re-enabled with <code>/spam on</code>.",
  );
}

async function handleFilterCommand(
  chatId: number,
  identity: TelegramIdentity,
  args: string[],
) {
  const action = args[0]?.toLowerCase();
  const phrase = args.slice(1).join(" ").trim();
  if (action !== "add" && action !== "remove") {
    await sendTelegramMessage(
      chatId,
      "Use <code>/filter add phrase</code> or <code>/filter remove phrase</code>. Phrases must be 2–80 characters.",
    );
    return;
  }
  if (!phrase) {
    await sendTelegramMessage(
      chatId,
      action === "add"
        ? "Add a phrase after the command, for example <code>/filter add free crypto</code>."
        : "Enter the exact phrase to remove, for example <code>/filter remove free crypto</code>.",
    );
    return;
  }
  const context = await requireTelegramCommunityOwner(chatId, identity);
  if (!context) return;

  if (action === "add") {
    const result = await addTelegramCommunityKeywordRule({
      chatId: String(chatId),
      telegramUserId: identity.id,
      phrase,
    });
    if (result.status === "invalid_phrase") {
      await sendTelegramMessage(chatId, "That phrase is invalid. Use 2–80 characters without control characters.");
      return;
    }
    if (result.status === "already_exists") {
      await sendTelegramMessage(chatId, "That exact-word or exact-phrase filter is already saved.");
      return;
    }
    if (result.status === "not_owner") {
      await sendTelegramMessage(chatId, "Only the linked organisation owner can manage phrase filters.");
      return;
    }
    logger.info({
      chatId,
      organisationId: result.context.organisationId,
      actorUserId: result.context.ownerUserId,
      ruleId: result.ruleId,
    }, "Telegram community phrase filter added");
    await sendTelegramMessage(
      chatId,
      `Added filter <code>${escapeTelegramHtml(phrase)}</code>${result.context.spamProtectionEnabled ? ". It is active now." : ". It is saved but inactive until an owner runs /spam on."}`,
    );
    return;
  }

  const result = await removeTelegramCommunityKeywordRule({
    chatId: String(chatId),
    telegramUserId: identity.id,
    phrase,
  });
  if (result.status === "invalid_phrase") {
    await sendTelegramMessage(chatId, "Enter the exact filter phrase to remove (2–80 characters).");
    return;
  }
  if (result.status === "not_found") {
    await sendTelegramMessage(chatId, "I couldn't find an active filter with that exact phrase.");
    return;
  }
  if (result.status === "not_owner") {
    await sendTelegramMessage(chatId, "Only the linked organisation owner can manage phrase filters.");
    return;
  }
  logger.info({
    chatId,
    organisationId: result.context.organisationId,
    actorUserId: result.context.ownerUserId,
    ruleId: result.ruleId,
  }, "Telegram community phrase filter removed");
  await sendTelegramMessage(chatId, `Removed filter <code>${escapeTelegramHtml(phrase)}</code>.`);
}

async function handleFiltersCommand(chatId: number, identity: TelegramIdentity) {
  const context = await requireTelegramCommunityOwner(chatId, identity);
  if (!context) return;
  const rules = await listTelegramCommunityKeywordRules(String(chatId), 21);
  if (!rules.length) {
    await sendTelegramMessage(
      chatId,
      `No phrase filters are saved for <b>${escapeTelegramHtml(context.chatTitle)}</b>.\nAdd one with <code>/filter add phrase</code>.`,
    );
    return;
  }
  const visibleRules = rules.slice(0, 20);
  const more = rules.length > visibleRules.length ? "\n…and more. Remove a phrase by its exact text." : "";
  await sendTelegramMessage(
    chatId,
    `<b>Saved phrase filters</b> · ${visibleRules.length}${more}\n\n${visibleRules
      .map((rule) => `• <code>${escapeTelegramHtml(rule.phrase)}</code>`)
      .join("\n")}\n\nProtection is <b>${context.spamProtectionEnabled ? "ON" : "OFF"}</b>. Remove one with <code>/filter remove phrase</code>.`,
  );
}

async function moderateCommunityMessage(
  message: NonNullable<TelegramUpdate["message"]>,
): Promise<boolean> {
  const text = message.text ?? "";
  const caption = message.caption ?? "";
  if ((!text && !caption) || !isGroupChat(message.chat.type)) return false;
  try {
    const community = await getTelegramCommunity(String(message.chat.id));
    if (!community?.spamProtectionEnabled) return false;

    const phraseTexts = [text, caption].filter((value): value is string => Boolean(value));
    if (phraseTexts.length) {
      const phraseRules = await listTelegramCommunityKeywordRules(String(message.chat.id), 100);
      const matchedPhrase = phraseRules.find((rule) =>
        phraseTexts.some((phraseText) => matchesCommunityModerationPhrase(phraseText, rule.phrase)),
      );
      if (matchedPhrase) {
        const deleted = await telegramCall<boolean>("deleteMessage", {
          chat_id: message.chat.id,
          message_id: message.message_id,
        });
        const logFields = {
          chatId: message.chat.id,
          messageId: message.message_id,
          ruleId: matchedPhrase.id,
          targetTelegramUserId: message.from?.id,
          deletionSucceeded: deleted === true,
        };
        if (deleted === true) {
          logger.info(logFields, "Community message removed by a phrase filter");
        } else {
          logger.warn(logFields, "Community phrase matched but the message could not be removed");
        }
        return true;
      }
    }

    const links = [
      ...extractCommunityMessageLinks(text, message.entities),
      ...extractCommunityMessageLinks(caption, message.caption_entities),
    ];
    if (!links.length) return false;

    const allowedLinks = await listTelegramCommunityLinkRules(String(message.chat.id), 100);
    if (!allowedLinks.length) return false;
    const unapprovedLink = links.find((link) => !isCommunityLinkWhitelisted(link, allowedLinks));
    if (!unapprovedLink) return false;

    const deleted = await telegramCall<boolean>("deleteMessage", {
      chat_id: message.chat.id,
      message_id: message.message_id,
    });
    const logFields = {
      chatId: message.chat.id,
      messageId: message.message_id,
      targetTelegramUserId: message.from?.id,
      unapprovedLink,
      deletionSucceeded: deleted === true,
    };
    if (deleted === true) {
      logger.info(logFields, "Community message removed because it contained an unlisted link");
    } else {
      logger.warn(logFields, "Community message with an unlisted link could not be removed");
    }
    return true;
  } catch (error) {
    logger.error(
      { err: error, chatId: message.chat.id, messageId: message.message_id },
      "Community message moderation could not be checked",
    );
    return false;
  }
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const text = message.text;
  const identity = message.from;
  if (!identity || identity.is_bot || (!text && !message.caption)) return;

  if (message.chat.type === "private" && message.chat.id === identity.id) {
    if (!text) return;
    const pending = pendingPrivateCommunityPhrases.get(identity.id);
    if (pending && pending.expiresAt <= Date.now()) {
      pendingPrivateCommunityPhrases.delete(identity.id);
      if (!text.trim().startsWith("/")) {
        await sendTelegramMessage(
          message.chat.id,
          "The add-filter request expired. Use /community to reopen your group controls.",
        );
        return;
      }
    } else if (pending) {
      if (text.trim().toLowerCase() === "/cancel") {
        pendingPrivateCommunityPhrases.delete(identity.id);
        await sendTelegramMessage(message.chat.id, "Add-filter request canceled.");
        return;
      }
      if (!text.trim().startsWith("/")) {
        pendingPrivateCommunityPhrases.delete(identity.id);
        await runCommunityControlsSafely(message.chat.id, "add_private_phrase_filter", () =>
          handlePrivateCommunityPhraseInput(
            message.chat.id,
            pending.chatId,
            identity,
            text,
          ),
        );
        return;
      }
      pendingPrivateCommunityPhrases.delete(identity.id);
    }
  }

  if (text && text.trim().startsWith("/")) {
    await handleCommand(message.chat.id, message.chat.type, identity, text, message.chat.title);
    return;
  }
  if (message.chat.type === "private") {
    if (text) await handleRiddleReply(message, identity, text);
    return;
  }
  if (!isGroupChat(message.chat.type)) return;
  if (await moderateCommunityMessage(message)) return;
  if (!text) return;

  await handleRiddleReply(message, identity, text);

  const rewardAmount = parseAdminRewardAmount(text);
  const reply = message.reply_to_message;
  if (rewardAmount !== null && reply?.from && !reply.from.is_bot && reply.from.id !== identity.id) {
    if (!(await isTelegramChatAdmin(message.chat.id, identity.id))) return;

    const [admin, recipient] = await Promise.all([
      upsertTelegramUser(identity),
      upsertTelegramUser(reply.from),
    ]);
    const result = await processAdminCommunityReward({
      admin,
      recipient,
      chatId: String(message.chat.id),
      chatTitle: message.chat.title ?? "Telegram group",
      telegramMessageId: String(message.message_id),
      targetMessageId: String(reply.message_id),
      targetText: reply.text ?? reply.caption,
      amount: rewardAmount,
    });
    if (result.awarded) {
      const recipientName = recipient.username
        ? `@${recipient.username}`
        : recipient.name;
      await sendTelegramMessage(
        message.chat.id,
        `<b>Community recognition</b>\n${escapeTelegramHtml(recipientName)} received +${result.xpAwarded} Community XP.`,
      );
    } else if (result.reason === "member_lifetime_cap") {
      await sendTelegramMessage(
        message.chat.id,
        "That member has reached the 250 XP lifetime limit for this community.",
      );
    } else if (result.reason === "community_daily_cap") {
      await sendTelegramMessage(
        message.chat.id,
        "This community has used its 1,000 XP daily budget. It resets at 00:00 UTC.",
      );
    } else if (result.reason === "daily_limit") {
      await sendTelegramMessage(
        message.chat.id,
        "This admin has already awarded the maximum recognition XP to this member today.",
      );
    }
    return;
  }

  const qualification = getMessageQualification({
    text,
    isGroup: true,
    isBot: false,
  });
  if (!qualification.qualifies) return;

  const user = await upsertTelegramUser(identity);
  await processCommunityMessage({
    user,
    chatId: String(message.chat.id),
    chatTitle: message.chat.title ?? "Telegram group",
    telegramMessageId: String(message.message_id),
    text,
    isGroup: true,
    isBot: false,
  });
}

async function handleCallback(update: NonNullable<TelegramUpdate["callback_query"]>) {
  await answerCallback(update.id);
  const chatType = update.message?.chat.type;
  if (chatType && chatType !== "private" && !isGroupChat(chatType)) return;
  const chatId = update.message?.chat.id ?? update.from.id;
  const callback = update.data ?? "";
  const privateCommunityPrefix = "community:private:";
  if (callback.startsWith(privateCommunityPrefix)) {
    if (
      chatType !== "private" ||
      !update.message ||
      update.message.chat.id !== update.from.id
    ) {
      return;
    }
    await runCommunityControlsSafely(update.from.id, "private_community_management", () =>
      handlePrivateCommunityCallback(update.from.id, callback, update.from),
    );
    return;
  }
  const communityConnectPrefix = "community:connect:";
  if (callback.startsWith(communityConnectPrefix)) {
    if (!update.message || !isGroupChat(chatType)) return;
    const organisationId = Number(callback.slice(communityConnectPrefix.length));
    if (!Number.isSafeInteger(organisationId) || organisationId <= 0) {
      await sendTelegramMessage(chatId, "That organisation selection is invalid. Run /community and try again.");
      return;
    }
    await runCommunityControlsSafely(chatId, "connect_group", () =>
      handleCommunityConnectionCallback(
        chatId,
        update.message?.chat.title ?? "Telegram community",
        update.from,
        organisationId,
      ),
    );
    return;
  }
  if (callback === "community:disconnect:cancel") {
    if (!update.message || !isGroupChat(chatType)) return;
    await sendTelegramMessage(chatId, "Group disconnection canceled. Your link and settings are unchanged.");
    return;
  }
  if (callback === "community:disconnect:confirm") {
    if (!update.message || !isGroupChat(chatType)) return;
    await runCommunityControlsSafely(chatId, "disconnect_group", async () => {
      await handleCommunityDisconnectCallback(chatId, update.from);
    });
    return;
  }
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
  if (chatType && chatType !== "private") return;
  const [kind, action, rawId] = update.data?.split(":") ?? [];
  const id = Number(rawId);
  if (kind !== "friend" || !["accept", "decline"].includes(action) || !Number.isSafeInteger(id)) return;
  const user = await findUserByTelegramId(update.from.id);
  if (!user) return;
  const accepted = action === "accept";
  const updated = await updateFriendRequestStatus(id, user.id, accepted ? "accepted" : "declined");
  if (!updated) return;
  const requester = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, updated.requesterUserId),
  });
  const recipientChatId = update.message?.chat.id ?? user.telegramId;
  if (!accepted) {
    await sendTelegramMessage(recipientChatId, "<b>Friend request declined</b>\n\nYou declined the request.");
    if (requester) {
      await sendFriendRequestDeclinedNotification(
        requester.telegramId,
        user.name,
        user.username,
      );
    }
  } else if (requester) {
    await sendFriendshipConnectedNotification(recipientChatId, requester.name, requester.username);
    await sendFriendRequestAcceptedNotification(requester.telegramId, user.name, user.username);
  } else {
    await sendTelegramMessage(recipientChatId, "<b>Friend request accepted</b>\n\nYou’re now connected.");
  }
}

const commandAnalyticsCategory: Record<string, AnalyticsEventCategory> = {
  "/start": "start",
  "/menu": "menu",
  "/onboarding": "onboarding",
  "/help": "help",
  "/experiences": "experiences",
  "/xp": "xp",
  "/progress": "progress",
  "/rank": "rank",
  "/leaderboard": "leaderboard",
  "/profile": "profile",
  "/friends": "friends",
  "/requests": "requests",
  "/add": "add",
  "/addfriend": "add",
  "/accountability": "accountability",
  "/host": "host",
  "/create": "create",
};

function commandAnalyticsCategoryFor(text: string): AnalyticsEventCategory {
  const command = parseTelegramCommand(text, botUsername)?.command;
  return command ? commandAnalyticsCategory[command] ?? "other" : "other";
}

function callbackAnalyticsCategoryFor(data: string | undefined): AnalyticsEventCategory {
  if (data === "menu:open") return "menu";
  if (data?.startsWith("onboarding:")) return "onboarding";
  if (data?.startsWith("friend:")) return "friendship";
  return "other";
}

async function poll(offset: number): Promise<void> {
  if (!botRunning || !telegramPollingLease) return;
  let nextOffset = offset;
  let retryDelayMs = 500;
  try {
    const updates = await telegramCall<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: 25,
      allowed_updates: ["message", "callback_query"],
    });
    if (!botRunning || !telegramPollingLease) return;
    if (updates === null) {
      const conflictDetected = pollingConflictDetected;
      pollingConflictDetected = false;
      retryDelayMs = nextPollingRetryDelay();
      if (conflictDetected) {
        retryDelayMs = Math.max(retryDelayMs, TELEGRAM_POLLING_CONFLICT_BACKOFF_MS);
      }
      return;
    }
    consecutivePollingFailures = 0;
    pollingConflictDetected = false;
    for (const update of updates ?? []) {
      nextOffset = Math.max(nextOffset, update.update_id + 1);
      try {
        if (update.message?.text) {
          await handleMessage(update.message);
          if (update.message.text.trim().startsWith("/")) {
            void recordAnalyticsEvent({
              source: "bot",
              eventName: "bot_command",
              category: commandAnalyticsCategoryFor(update.message.text),
              platform: "telegram",
              outcome: "success",
            });
          }
        } else if (update.callback_query) {
          await handleCallback(update.callback_query);
          void recordAnalyticsEvent({
            source: "bot",
            eventName: "bot_callback",
            category: callbackAnalyticsCategoryFor(update.callback_query.data),
            platform: "telegram",
            outcome: "success",
          });
        }
      } catch (error) {
        if (update.message?.text?.trim().startsWith("/")) {
          void recordAnalyticsEvent({
            source: "bot",
            eventName: "bot_command",
            category: commandAnalyticsCategoryFor(update.message.text),
            platform: "telegram",
            outcome: "failure",
          });
        } else if (update.callback_query) {
          void recordAnalyticsEvent({
            source: "bot",
            eventName: "bot_callback",
            category: callbackAnalyticsCategoryFor(update.callback_query.data),
            platform: "telegram",
            outcome: "failure",
          });
        }
        logger.error({ err: error }, "Telegram update handling failed");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Telegram polling iteration failed");
    retryDelayMs = nextPollingRetryDelay();
  } finally {
    if (!token() && botRunning) {
      botRunning = false;
      void releaseTelegramPollingLease();
    } else if (token() && botRunning) {
      setTimeout(() => void poll(nextOffset), retryDelayMs);
    }
  }
}

export async function startTelegramBot() {
  if (botRunning || botStarting) return;
  if (!token()) {
    logger.warn("TELEGRAM_BOT_TOKEN is not configured; bot polling is disabled.");
    return;
  }
  botStarting = true;
  let leaseLostBeforeAssignment = false;
  try {
    const lease = await tryAcquireTelegramPollingLease(
      pool,
      (error) => {
        leaseLostBeforeAssignment = true;
        handleTelegramPollingLeaseLost(error);
      },
    );
    if (!lease) {
      const now = Date.now();
      if (now - lastPollingLeaseBusyLogAt >= 60_000) {
        lastPollingLeaseBusyLogAt = now;
        logger.warn(
          "Another API instance owns Telegram polling; this instance will retry without calling getUpdates.",
        );
      }
      scheduleTelegramBotRetry(TELEGRAM_POLLING_CONFLICT_BACKOFF_MS);
      return;
    }
    if (leaseLostBeforeAssignment) {
      await lease.release();
      return;
    }
    telegramPollingLease = lease;

    const me = await telegramCall<{ id?: number; username?: string }>("getMe", {});
    if (telegramPollingLease !== lease) return;
    if (!me) {
      await releaseTelegramPollingLease();
      scheduleTelegramBotRetry(5_000);
      return;
    }
    botUsername = me.username ?? null;
    if (me.id && Number.isSafeInteger(me.id)) botTelegramId = me.id;

    const webhookRemoved = await telegramCall<boolean>("deleteWebhook", {
      drop_pending_updates: false,
    });
    if (telegramPollingLease !== lease) return;
    if (webhookRemoved !== true) {
      logger.error("Telegram webhook state could not be verified; polling was not started.");
      await releaseTelegramPollingLease();
      scheduleTelegramBotRetry(TELEGRAM_POLLING_CONFLICT_BACKOFF_MS);
      return;
    }

    botRunning = true;
    await registerTelegramCommands();
    if (telegramPollingLease !== lease || !botRunning) return;
    logger.info({ username: me.username }, "Telegram bot polling started");
    void poll(0);
  } catch (error) {
    botRunning = false;
    logger.error({ err: error }, "Telegram bot startup failed; polling will retry.");
    await releaseTelegramPollingLease();
    scheduleTelegramBotRetry(5_000);
  } finally {
    botStarting = false;
  }
}