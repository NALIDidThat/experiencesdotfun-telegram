export type SocialInviteKind = "friend" | "accountability";
export type SocialInvitePlatform = "android" | "ios" | "web" | "other";

export interface SocialInviteShareContent {
  title: string;
  text: string;
  message: string;
  url?: string;
}

export function createSocialInviteShareContent(
  kind: SocialInviteKind,
  rawUsername: string,
  url: string,
  platform: SocialInvitePlatform,
): SocialInviteShareContent {
  const username = rawUsername.trim().replace(/^@+/, "");
  if (!username) throw new Error("A username is required to create an invite message.");

  const isAccountability = kind === "accountability";
  const title = isAccountability
    ? "🤝 Accountability partner invite"
    : "✨ Experiences.fun friend invite";
  const text = isAccountability
    ? [
        "🤝 ACCOUNTABILITY PARTNER INVITE",
        "",
        "Let’s support each other and stay consistent on Experiences.fun.",
        "",
        `👤 Sign up with @${username}`,
        "",
        "1️⃣ Accept my friend request",
        "2️⃣ I’ll send your partner invitation once we’re connected",
        "",
        "✨ Let’s make progress together",
      ].join("\n")
    : [
        "✨ FRIEND INVITE",
        "",
        "Let’s connect on Experiences.fun and discover meaningful things to do together.",
        "",
        `👤 Sign up with @${username}`,
        "🤝 Accept my friend request to connect",
        "",
        "🌱 Hope to see you there!",
      ].join("\n");

  const hasSeparateUrlField = platform === "ios" || platform === "web";
  const message = platform === "android" || platform === "other"
    ? `${text}\n\n${url}`
    : text;

  return {
    title,
    text,
    message,
    ...(hasSeparateUrlField ? { url } : {}),
  };
}