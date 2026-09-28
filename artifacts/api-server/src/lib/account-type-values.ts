import type { UserType } from "@workspace/db/schema";
import type { TelegramIdentity } from "./telegram-init-data";

type EmailProfileInput = {
  name: string;
  username: string;
  userType: UserType;
};

export function emailProfileValues(
  input: EmailProfileInput,
  telegramId: string,
) {
  return {
    telegramId,
    name: input.name.trim(),
    username: input.username.trim().replace(/^@+/, "").toLowerCase(),
    userType: input.userType,
  };
}

export function telegramProfileValues(
  identity: TelegramIdentity,
  avatarUrl: string | undefined,
  selectedUserType?: UserType,
) {
  return {
    name: [identity.first_name, identity.last_name].filter(Boolean).join(" ") || "Telegram user",
    username: null,
    avatarUrl: avatarUrl ?? null,
    userType: selectedUserType ?? null,
  };
}

export function telegramProfileRoleUpdate(
  existingUserType: UserType | null,
  selectedUserType?: UserType,
): { userType: UserType } | Record<string, never> {
  return existingUserType === null && selectedUserType !== undefined
    ? { userType: selectedUserType }
    : {};
}