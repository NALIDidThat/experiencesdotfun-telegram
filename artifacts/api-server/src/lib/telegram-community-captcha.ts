const TELEGRAM_COMMUNITY_CAPTCHA_CALLBACK = /^community:captcha:(-?[0-9]{1,20}):([1-9][0-9]{0,19})$/;

export function isMatchingTelegramCommunityCaptchaCallback(input: {
  callbackData: string;
  chatId: number;
  userId: number;
}): boolean {
  const match = TELEGRAM_COMMUNITY_CAPTCHA_CALLBACK.exec(input.callbackData);
  if (!match || !Number.isSafeInteger(input.chatId) || !Number.isSafeInteger(input.userId)) {
    return false;
  }
  return Number(match[1]) === input.chatId && Number(match[2]) === input.userId;
}
