import crypto from "node:crypto";

export type TelegramIdentity = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
  photo_url?: string;
};

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): TelegramIdentity {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Telegram init data is missing its hash.");

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const provided = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    throw new Error("Telegram init data signature is invalid.");
  }

  const authDate = Number(params.get("auth_date"));
  if (
    !Number.isSafeInteger(authDate) ||
    authDate <= 0 ||
    authDate > nowSeconds + 60 ||
    nowSeconds - authDate > 86_400
  ) {
    throw new Error("Telegram init data has expired.");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram init data is missing its user.");
  const telegramUser = JSON.parse(rawUser) as TelegramIdentity;
  if (!Number.isSafeInteger(telegramUser.id)) {
    throw new Error("Telegram user id is invalid.");
  }
  return telegramUser;
}