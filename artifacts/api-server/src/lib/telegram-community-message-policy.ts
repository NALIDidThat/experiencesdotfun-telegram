type TelegramCommunityMessage = {
  from?: { is_bot?: boolean } | null;
  [field: string]: unknown;
};

const TELEGRAM_SERVICE_MESSAGE_FIELDS = [
  "new_chat_members",
  "left_chat_member",
  "new_chat_title",
  "new_chat_photo",
  "delete_chat_photo",
  "group_chat_created",
  "supergroup_chat_created",
  "channel_chat_created",
  "migrate_to_chat_id",
  "migrate_from_chat_id",
  "pinned_message",
  "video_chat_scheduled",
  "video_chat_started",
  "video_chat_ended",
  "video_chat_participants_invited",
  "forum_topic_created",
  "forum_topic_edited",
  "forum_topic_closed",
  "forum_topic_reopened",
  "general_forum_topic_hidden",
  "general_forum_topic_unhidden",
] as const;

export function isCountableTelegramCommunityMessage(
  message: TelegramCommunityMessage,
): boolean {
  return Boolean(
    message.from &&
      message.from.is_bot !== true &&
      !TELEGRAM_SERVICE_MESSAGE_FIELDS.some((field) => field in message),
  );
}

export function isNewTelegramCommunityMessageId(
  lastMessageId: number | null,
  messageId: number,
): boolean {
  return (
    Number.isSafeInteger(messageId) &&
    messageId > 0 &&
    (lastMessageId === null || messageId > lastMessageId)
  );
}
