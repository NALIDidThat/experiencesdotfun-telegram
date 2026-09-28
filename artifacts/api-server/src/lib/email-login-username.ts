const emailLoginUsernamePattern = /^[a-z0-9_]{5,32}$/;

export function normalizeEmailLoginUsername(username: string): string {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

export function isValidEmailLoginUsername(username: string): boolean {
  return emailLoginUsernamePattern.test(normalizeEmailLoginUsername(username));
}