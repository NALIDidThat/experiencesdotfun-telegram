export type TelegramButton = {
  text: string;
  web_app?: { url: string };
  url?: string;
  callback_data?: string;
};

export type TelegramKeyboard = TelegramButton[][];

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