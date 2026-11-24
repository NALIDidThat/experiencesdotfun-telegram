export type TelegramButton = {
  text: string;
  web_app?: { url: string };
  url?: string;
  callback_data?: string;
};

export type TelegramKeyboard = TelegramButton[][];

export function buildTelegramAddCommunityUrl(botUsername: string): string | null {
  const username = botUsername.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) return null;
  return `https://t.me/${encodeURIComponent(username)}?startgroup=community`;
}

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
    "Find real-world experiences, join your community, and keep a record of what you contribute.",
    "",
    "<b>Start here</b>",
    "🔎 Discover activities near you",
    "🎟️ Join or create an experience",
    "🤝 Connect with friends and communities",
    "🏆 Get recognised when your contribution is verified",
    "",
    "Choose an option below to open the app.",
  ].join("\n");
}

function formatTelegramAiText(value: string): string {
  return escapeTelegramHtml(value)
    .split("\n")
    .map((line) => {
      const heading = /^#{1,3}\s+(.+)$/.exec(line);
      const content = heading ? heading[1]! : line;
      const formatted = content
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/`([^`\n]+)`/g, "<code>$1</code>");
      if (heading) return `<b>${formatted}</b>`;
      return formatted.replace(/^\s*[-*•]\s+/, "• ");
    })
    .join("\n");
}

export function formatTelegramAiReply(
  answer: string,
  sources: readonly { title: string; url: string }[],
): string {
  const responseBody = sources.length
    ? answer.split(/\n\nSources\s*\n/i, 1)[0] ?? answer
    : answer;
  const sourceLines = sources.slice(0, 4).map((source) => {
    const title = escapeTelegramHtml(source.title.slice(0, 140));
    const url = escapeTelegramHtml(source.url.slice(0, 300)).replaceAll('"', "&quot;");
    return `• <a href="${url}">${title}</a>`;
  });
  const sourceBlock = sourceLines.length
    ? `\n\n🔎 <b>Sources</b>\n${sourceLines.join("\n")}`
    : "";
  const maxLength = 4000;
  const answerBudget = Math.max(0, maxLength - sourceBlock.length - 2);
  const characters = [...responseBody.trim()];
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = characters.slice(0, middle).join("") +
      (middle < characters.length ? "…" : "");
    if (formatTelegramAiText(candidate).length <= answerBudget) low = middle;
    else high = middle - 1;
  }
  const truncated = low < characters.length;
  const answerText = characters.slice(0, low).join("") + (truncated ? "…" : "");
  const formattedAnswer = formatTelegramAiText(answerText);
  return `${formattedAnswer}${sourceBlock}`.slice(0, maxLength);
}

export function buildWelcomeKeyboard(urlForPath: (path: string) => string): TelegramKeyboard {
  return [
    [{ text: "Home", web_app: { url: urlForPath("/?screen=home") } }],
    [{ text: "Discover Experiences", web_app: { url: urlForPath("/?screen=explore") } }],
    [{ text: "Profile", web_app: { url: urlForPath("/?screen=profile") } }],
  ];
}

export function formatTelegramExperienceDate(dateValue: string): string {
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
    experience.date ? `📅 ${escapeTelegramHtml(formatTelegramExperienceDate(experience.date))}` : "",
    experience.city ? `📍 ${escapeTelegramHtml(experience.city)}` : "",
  ].filter(Boolean).join("\n");
}

function experienceReward(experience: TelegramExperienceNotice): string {
  const lines: string[] = [];
  if (experience.xpReward > 0) {
    lines.push(`After verification, <b>+${experience.xpReward} XP</b> will be ready to redeem.`);
  }
  const monetaryRewardPence = experience.monetaryRewardPence ?? 0;
  if (monetaryRewardPence > 0) {
    lines.push(`This experience lists a <b>£${(monetaryRewardPence / 100).toFixed(2)}</b> reward.`);
  }
  return lines.join("\n");
}

function friendLabel(name: string, username: string | null): string {
  return escapeTelegramHtml(username ? `@${username.replace(/^@/, "")}` : name);
}

export function formatExperienceJoinedNotice(experience: TelegramExperienceNotice): string {
  const reward = experienceReward(experience);
  return `<b>✅ You're booked in</b>\n\nYour place is confirmed for <b>${escapeTelegramHtml(experience.title)}</b>.\n\n${experienceContext(experience)}\n\n${
    reward
      ? `${reward}\n\nFollow the host's instructions after the experience so your contribution can be reviewed.`
      : "After the experience, follow the host's instructions so your contribution can be reviewed."
  }`;
}

export function formatHostNewParticipantNotice(
  participantName: string,
  experience: TelegramExperienceNotice,
): string {
  return `<b>👥 New participant</b>\n\n<b>${escapeTelegramHtml(participantName)}</b> joined <b>${escapeTelegramHtml(experience.title)}</b>.\n\n${experienceContext(experience)}\n\nReview the participant list in host tools.`;
}

export function formatCompletionSubmittedNotice(
  participantName: string,
  experience: TelegramExperienceNotice,
): string {
  return `<b>📝 Ready for review</b>\n\n<b>${escapeTelegramHtml(participantName)}</b> submitted a completion for <b>${escapeTelegramHtml(experience.title)}</b>.\n\nReview the contribution in host tools. XP is added only after verification.`;
}

export function formatContributionVerifiedNotice(experience: TelegramExperienceNotice): string {
  const xpReady = experience.xpReward > 0
    ? `<b>+${experience.xpReward} Experience XP</b> is ready to redeem. Open your XP history to add it to your profile balance.`
    : "Your contribution record has been updated.";
  const rewardLine = experience.monetaryRewardPence && experience.monetaryRewardPence > 0
    ? `\n\nThe host confirmed a reward of <b>£${(experience.monetaryRewardPence / 100).toFixed(2)}</b>.`
    : "";
  return `<b>🏆 Contribution verified</b>\n\nThe host confirmed your contribution to <b>${escapeTelegramHtml(experience.title)}</b>.\n\n${xpReady}${rewardLine}`;
}

export function formatContributionRejectedNotice(experience: TelegramExperienceNotice): string {
  return `<b>🔎 Contribution needs another look</b>\n\nThe host couldn't verify your completion for <b>${escapeTelegramHtml(experience.title)}</b> yet. No XP or reward was added.\n\nOpen the experience details to see the host's feedback and what to do next.`;
}

export function formatFriendRequestNotice(name: string, username: string | null): string {
  return `<b>👋 Friend request</b>\n\n${friendLabel(name, username)} wants to connect with you.\n\nAccept to add them to your friends.`;
}

export function formatFriendRequestSentNotice(name: string, username: string | null): string {
  return `<b>✅ Request sent</b>\n\nYour friend request was sent to ${friendLabel(name, username)}.\n\nYou'll see them in your friends list if they accept.`;
}

export function formatFriendRequestAcceptedNotice(name: string, username: string | null): string {
  return `<b>✅ You're connected</b>\n\n${friendLabel(name, username)} accepted your friend request.`;
}

export function formatFriendshipConnectedNotice(name: string, username: string | null): string {
  return `<b>✅ You're connected</b>\n\nYou and ${friendLabel(name, username)} are now friends.`;
}

export function formatFriendRequestDeclinedNotice(name: string, username: string | null): string {
  return `<b>Friend request declined</b>\n\n${friendLabel(name, username)} declined your request.`;
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