export const TELEGRAM_CUSTOM_COMMAND_LIMIT = 20;
export const TELEGRAM_CUSTOM_COMMAND_RESPONSE_LIMIT = 3500;

const RESERVED_COMMANDS = new Set([
  "start",
  "menu",
  "experiences",
  "xp",
  "progress",
  "rank",
  "leaderboard",
  "riddle",
  "clue",
  "profile",
  "add",
  "addfriend",
  "friends",
  "requests",
  "accountability",
  "create",
  "host",
  "onboarding",
  "help",
  "community",
  "spam",
  "filter",
  "filters",
]);

export function normalizeTelegramCustomCommand(value) {
  if (typeof value !== "string") return null;
  const command = value.trim().replace(/^\/+/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,32}$/.test(command) || RESERVED_COMMANDS.has(command)) {
    return null;
  }
  return command;
}

export function normalizeTelegramCustomCommandResponse(value) {
  if (typeof value !== "string") return null;
  const response = value.trim();
  const length = Array.from(response).length;
  if (length < 1 || length > TELEGRAM_CUSTOM_COMMAND_RESPONSE_LIMIT) return null;
  return response;
}
