export type TelegramButton = {
  text: string;
  web_app?: { url: string };
  url?: string;
  callback_data?: string;
};

export type TelegramKeyboard = TelegramButton[][];

export type TelegramExperienceNotice = {
  id: number;
  title: string;
  date: string;
  city: string;
  xpReward: number;
  monetaryRewardPence?: number | null;
};

export function escapeTelegramHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatWelcomeMessage(): string {
  return [
    "<b>🌍 Welcome to Experiences.fun</b>",
    "",
    "Experiences.fun is a social platform for discovering, creating and completing real-world experiences with the people, organizations and communities around you.",
    "",
    "<b>🎯 Turn experiences into impact.</b>",
    "Discover things to do, join community activities, challenge your friends, earn XP and build a reputation based on what you actually contributed to the world.",
    "",
    "<b>✨ Here’s what you can do:</b>",
    "• 🔎 Discover experiences happening around you",
    "• 🎟️ Create and join experiences",
    "• 🤝 Connect with friends &amp; local communities",
    "• 🏆 Complete challenges and earn XP",
    "• 🌱 Contribute to social &amp; environmental impact",
    "• 📈 Build your on-chain reputation over time",
    "",
    "<b>Your experiences become your story.</b>",
    "",
    "<b>Your contributions become your reputation.</b>",
    "",
    "<b>Welcome to the Social OS for real-world communities.</b>",
    "",
    "👇 Start exploring our telegram mini-app below",
  ].join("\n");
}

export function buildWelcomeKeyboard(urlForPath: (path: string) => string): TelegramKeyboard {
  return [
    [{ text: "Home", web_app: { url: urlForPath("/?screen=home") } }],
    [{ text: "Discover Experiences", web_app: { url: urlForPath("/?screen=explore") } }],
    [{ text: "Profile", web_app: { url: urlForPath("/?screen=profile") } }],
  ];
}

function formatExperienceDate(dateValue: string): string {
  const date = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function experienceContext(experience: TelegramExperienceNotice): string {
  return [
    experience.date ? `📅 ${escapeTelegramHtml(formatExperienceDate(experience.date))}` : "",
    experience.city ? `📍 ${escapeTelegramHtml(experience.city)}` : "",
  ].filter(Boolean).join("\n");
}

function experienceReward(experience: TelegramExperienceNotice): string {
  const rewards: string[] = [];
  if (experience.xpReward > 0) rewards.push(`+${experience.xpReward} XP`);
  const monetaryRewardPence = experience.monetaryRewardPence ?? 0;
  if (monetaryRewardPence > 0) rewards.push(`£${(monetaryRewardPence / 100).toFixed(2)}`);
  return rewards.join(" · ");
}

function friendLabel(name: string, username: string | null): string {
  return escapeTelegramHtml(username ? `@${username.replace(/^@/, "")}` : name);
}

export function formatExperienceJoinedNotice(experience: TelegramExperienceNotice): string {
  const reward = experienceReward(experience);
  return `<b>🎟 You're in</b>\n\nYour place is confirmed for <b>${escapeTelegramHtml(experience.title)}</b>.\n\n${experienceContext(experience)}\n\n${
    reward
      ? `When the host verifies your contribution, you’ll receive <b>${reward}</b>.`
      : "The host will verify your contribution after the experience."
  }`;
}

export function formatHostNewParticipantNotice(
  participantName: string,
  experience: TelegramExperienceNotice,
): string {
  return `<b>👥 New participant</b>\n\n<b>${escapeTelegramHtml(participantName)}</b> joined <b>${escapeTelegramHtml(experience.title)}</b>.\n\n${experienceContext(experience)}\n\nOpen host tools to review participants.`;
}

export function formatCompletionSubmittedNotice(
  participantName: string,
  experience: TelegramExperienceNotice,
): string {
  return `<b>📝 Completion submitted</b>\n\n<b>${escapeTelegramHtml(participantName)}</b> submitted a completion for <b>${escapeTelegramHtml(experience.title)}</b>.\n\nReview the contribution in host tools before verifying it.`;
}

export function formatContributionVerifiedNotice(experience: TelegramExperienceNotice): string {
  const xpReady = experience.xpReward > 0
    ? `<b>+${experience.xpReward} Experience XP</b> is ready to redeem. Open your XP history to add it to your profile balance.`
    : "Your profile has been updated.";
  const rewardLine = experience.monetaryRewardPence && experience.monetaryRewardPence > 0
    ? `\n\nReward confirmed: <b>£${(experience.monetaryRewardPence / 100).toFixed(2)}</b>.`
    : "";
  return `<b>🏆 Contribution verified</b>\n\nThe host confirmed your contribution to <b>${escapeTelegramHtml(experience.title)}</b>.\n\n${xpReady}${rewardLine}`;
}

export function formatContributionRejectedNotice(experience: TelegramExperienceNotice): string {
  return `<b>🔎 Contribution needs follow-up</b>\n\nThe host couldn’t verify your completion for <b>${escapeTelegramHtml(experience.title)}</b> yet.\n\nOpen the experience details to review your next steps. No XP or reward was added.`;
}

export function formatFriendRequestNotice(name: string, username: string | null): string {
  return `<b>New friend request</b>\n\n${friendLabel(name, username)} wants to connect with you.\n\nAccept the request to add them to your friends.`;
}

export function formatFriendRequestSentNotice(name: string, username: string | null): string {
  return `<b>Friend request sent</b>\n\nYour request is on its way to ${friendLabel(name, username)}.\n\nIf they accept, you’ll see them in your friends list.`;
}

export function formatFriendRequestAcceptedNotice(name: string, username: string | null): string {
  return `<b>Friend request accepted</b>\n\n${friendLabel(name, username)} accepted your request. You’re now connected.`;
}

export function formatFriendshipConnectedNotice(name: string, username: string | null): string {
  return `<b>You’re connected</b>\n\nYou and ${friendLabel(name, username)} are now friends.`;
}

export function formatFriendRequestDeclinedNotice(name: string, username: string | null): string {
  return `<b>Friend request declined</b>\n\n${friendLabel(name, username)} declined your friend request.`;
}

export function parseTelegramCommand(text: string, botUsername: string | null) {
  const [rawCommand, ...args] = text.trim().split(/\s+/);
  const match = rawCommand.match(/^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?$/i);
  if (!match) return null;

  const [, name, mentionedBot] = match;
  if (
    mentionedBot &&
    botUsername &&
    mentionedBot.toLowerCase() !== botUsername.toLowerCase()
  ) {
    return null;
  }

  return { command: `/${name.toLowerCase()}`, args };
}

export function makeChatCompatibleKeyboard(
  chatId: number,
  keyboard?: TelegramKeyboard,
): TelegramKeyboard | undefined {
  if (chatId >= 0 || !keyboard) return keyboard;

  return keyboard.map((row) =>
    row.map((button) =>
      button.web_app
        ? { text: button.text, url: button.web_app.url }
        : button,
    ),
  );
}