import crypto from "node:crypto";

export interface ClaimableSocialInvite {
  targetUsername: string;
  expiresAt: Date;
  claimedAt: Date | null;
}

export function createInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function inviteTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function shareUrl(token: string): string {
  return `https://t.me/experiencesdotfun_bot?start=invite_${token}`;
}

export function canClaimSocialInvite(
  invite: ClaimableSocialInvite,
  username: string | null | undefined,
  now = new Date(),
): boolean {
  return Boolean(
    username &&
    invite.claimedAt === null &&
    invite.expiresAt > now &&
    username.trim().replace(/^@+/, "").toLowerCase() === invite.targetUsername.toLowerCase(),
  );
}