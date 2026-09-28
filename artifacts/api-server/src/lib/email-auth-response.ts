export function toEmailSignupResponse<T>(user: T): { user: T; isNew: true } {
  return { user, isNew: true };
}