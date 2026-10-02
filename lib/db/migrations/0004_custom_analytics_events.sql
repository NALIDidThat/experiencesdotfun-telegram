-- Add aggregate experience lifecycle events to the analytics event allowlist.
-- Apply only after confirming the target database environment.
BEGIN;

ALTER TABLE "analytics_events"
  DROP CONSTRAINT IF EXISTS "analytics_events_event_name_check";

ALTER TABLE "analytics_events"
  ADD CONSTRAINT "analytics_events_event_name_check"
  CHECK (
    "event_name" IN (
      'screen_view',
      'auth_signup',
      'auth_login',
      'experience_view',
      'experience_create',
      'experience_edit',
      'experience_cancel',
      'experience_join',
      'experience_waitlist_join',
      'experience_attend',
      'completion_submit',
      'completion_verify',
      'completion_reject',
      'milestone_submit',
      'milestone_verify',
      'milestone_reject',
      'profile_update',
      'friend_request',
      'bot_command',
      'bot_callback',
      'community_contribution'
    )
  );

COMMIT;