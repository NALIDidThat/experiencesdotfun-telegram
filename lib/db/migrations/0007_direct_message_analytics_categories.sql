-- Allow the existing privacy-minimized screen-view event to record messaging screens.
BEGIN;

ALTER TABLE "analytics_events"
  DROP CONSTRAINT IF EXISTS "analytics_events_category_check";

ALTER TABLE "analytics_events"
  ADD CONSTRAINT "analytics_events_category_check"
  CHECK (
    "category" IN (
      'home',
      'explore',
      'experiences',
      'profile',
      'notifications',
      'messages',
      'direct-message',
      'friends',
      'friend-profile',
      'experience',
      'host',
      'create',
      'email',
      'telegram',
      'start',
      'menu',
      'onboarding',
      'help',
      'xp',
      'progress',
      'rank',
      'leaderboard',
      'requests',
      'add',
      'accountability',
      'friendship',
      'community',
      'other'
    )
  );

COMMIT;