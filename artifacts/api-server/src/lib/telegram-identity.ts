export type TelegramIdentityOwner = {
  telegramId: string;
};

export type TelegramProfileType = "participant" | "organisation";

export function selectTelegramProfile<T extends { userType: TelegramProfileType | null }>(
  profiles: readonly T[],
  selectedType?: TelegramProfileType,
): T | undefined {
  if (!selectedType) return profiles[0];
  return profiles.find((profile) => profile.userType === selectedType)
    ?? profiles.find((profile) => profile.userType === null);
}

export function hasSameTelegramIdentity(
  first: TelegramIdentityOwner,
  second: TelegramIdentityOwner,
): boolean {
  return first.telegramId === second.telegramId;
}