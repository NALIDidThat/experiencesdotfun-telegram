export function toEmailSignupResponse<T>(
  user: T,
  sessionToken: string,
): { user: T; isNew: true; sessionToken: string } {
  return { user, isNew: true, sessionToken };
}