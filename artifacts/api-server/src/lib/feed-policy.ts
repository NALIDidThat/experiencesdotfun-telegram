export const FEED_POSTS_PER_DAY_LIMIT = 10;
export const FEED_COMMENTS_PER_MINUTE_LIMIT = 10;

export function canCreateFeedPost(recentPosts: number): boolean {
  return Number.isFinite(recentPosts) && recentPosts < FEED_POSTS_PER_DAY_LIMIT;
}

export function canCreateFeedComment(recentComments: number): boolean {
  return Number.isFinite(recentComments) &&
    recentComments < FEED_COMMENTS_PER_MINUTE_LIMIT;
}

export function isSelfReportedAccountabilityEvent(type: string): boolean {
  return type === "accountability_checkin" ||
    type === "accountability_goal_completed";
}
