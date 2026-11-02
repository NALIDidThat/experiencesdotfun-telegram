export type TelegramMentionEntity = {
  type: string;
  offset: number;
  length: number;
  user?: { id?: number };
};

function removeRange(text: string, offset: number, length: number) {
  return `${text.slice(0, offset)} ${text.slice(offset + length)}`
    .replace(/[ \t]+/g, " ")
    .trim()
    .replace(/^[,.:;!?-]+\s*/, "")
    .trim();
}

function validRange(text: string, offset: number, length: number) {
  return Number.isInteger(offset)
    && Number.isInteger(length)
    && offset >= 0
    && length > 0
    && offset + length <= text.length;
}

export function extractBotMentionedText(
  text: string,
  entities: TelegramMentionEntity[] | undefined,
  botUsername: string | null,
  botTelegramId: number | null,
): string | null {
  const username = botUsername?.replace(/^@/, "").trim();
  const expectedMention = username ? `@${username}`.toLowerCase() : null;

  for (const entity of entities ?? []) {
    if (!validRange(text, entity.offset, entity.length)) continue;
    const entityText = text.slice(entity.offset, entity.offset + entity.length);
    const isUsernameMention =
      entity.type === "mention"
      && expectedMention !== null
      && entityText.toLowerCase() === expectedMention;
    const isTextMention =
      entity.type === "text_mention"
      && botTelegramId !== null
      && entity.user?.id === botTelegramId;
    if (isUsernameMention || isTextMention) {
      return removeRange(text, entity.offset, entity.length);
    }
  }

  if (!expectedMention) return null;
  const escapedUsername = expectedMention.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fallback = new RegExp(`(^|[\\s,])@${escapedUsername}(?=$|[\\s,.:!?])`, "i");
  const match = fallback.exec(text);
  if (!match || match.index === undefined) return null;
  const offset = match.index + match[1].length;
  return removeRange(text, offset, expectedMention.length);
}
