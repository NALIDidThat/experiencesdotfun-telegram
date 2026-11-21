import type { TelegramCommunityWelcomeButton } from "@workspace/db/schema";
import type { TelegramKeyboard } from "./telegram-utils";

export const TELEGRAM_COMMUNITY_WELCOME_MESSAGE_MAX_LENGTH = 3500;
export const TELEGRAM_COMMUNITY_WELCOME_BUTTON_MAX_LENGTH = 64;
export const TELEGRAM_COMMUNITY_WELCOME_BUTTON_MAX_COUNT = 6;

export function isValidTelegramWelcomeButtonUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function buildTelegramWelcomeKeyboard(
  buttons: readonly TelegramCommunityWelcomeButton[],
): TelegramKeyboard | undefined {
  if (buttons.length === 0) return undefined;
  return buttons.map(({ label, url }) => [{ text: label, url }]);
}
