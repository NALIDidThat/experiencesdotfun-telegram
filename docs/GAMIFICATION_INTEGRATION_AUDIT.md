# Experiences.fun Gamification Integration Audit

**Audit date:** 22 November 2026  
**Baseline:** Current Replit checkout, `main` at `4035d398432f0fff88de8dcdd932a25a1d6463b9`  
**Scope:** Existing XP and progression, experiences and verification, challenges, accountability, organisations, Telegram Community XP, learning, analytics, notifications, and mobile integration.

## Executive summary

The repository already has several working recognition systems, but they are separate and have different purposes:

1. **Experience XP** is a profile-scoped, auditable award ledger. Verified experiences, verified milestones, email signup, and the Memory Game can create awards. Awards remain pending until the participant explicitly redeems them into `users.xp`.
2. **Community XP** is a separate Telegram-group contribution ledger and ranking system. It must not be merged into Experience XP without a deliberate product decision.
3. **Memory Game score** has its own game progression and leaderboard. Successful play can also award a limited amount of Experience XP, but the game score itself is not the Experience XP balance.

The app has useful integration points: verified participation and milestone workflows, profile and activity screens, an XP history and redemption flow, community contribution records, accountability partnerships, experience challenges, and an OpenAPI-generated API client. However, there is no shared progression engine connecting those areas. No product mission engine, contribution streak engine, achievement definitions/unlocks, personal development journey engine, or weekly Experience XP leagues were found.

The safest route is to extend the existing `xp_awards` ledger and verified event flows, keep Community XP separate, and introduce only the data structures each new feature requires. Do not replace the existing XP balance, reset earned XP, or adopt suggested reward amounts or ten-level names from the supplied briefs without an explicit product decision.

One concrete data-quality issue should be corrected before community progression is expanded: `docs/community-xp.md` describes a 100-XP member/group daily limit, while current rules use a 250-XP lifetime cap per member and a 1,000-XP daily cap per community.

## Baseline and verification

- The checked-out branch is `main`; the working tree was clean before this report was added.
- Current Replit commit: `4035d398432f0fff88de8dcdd932a25a1d6463b9`.
- The locally tracked GitHub `main` ref is `9a9de8f6637d0dd857b9f32e6e46c4b2b94822a1`. It is an ancestor of the Replit checkout: Replit is 23 commits ahead and 0 commits behind that ref. The user selected the Replit checkout as the source of truth for this audit.
- Existing local task-agent branches include older XP-related history. The audited XP files on `replit-agent` match the current checkout; the two inspected `subrepl` branches have older/different XP trees and no additional implementation to reuse.
- The Expo and API workflows are running from this workspace. No app code was changed or restarted for this read-only audit.
- There are 37 checked-in SQL migration files through `0037_telegram_community_welcome_messages.sql`. The applied migration state of any live database was not queried.
- The Drizzle schema, OpenAPI specification, and generated React Query client are present. Code generation was not run, so their exact synchronization was not independently verified.
- Six focused, database-independent test files passed: **30 tests passed, 0 failed** across XP award rules, XP progression, Community XP rules, Memory Game rules, challenge rules, and accountability-goal rules. Database-backed redemption tests and full app/API suites were not run.

## A. Architecture map

```text
Experiences.fun Expo mobile app
  └─ generated React Query hooks
       └─ OpenAPI contract / generated Zod schemas
            └─ Express API routes
                 ├─ authenticated profile and organisation checks
                 ├─ domain rules and transaction helpers
                 └─ Drizzle ORM → PostgreSQL

Telegram bot
  └─ qualifying group messages / admin adjustments
       └─ Community XP rules and contribution ledger
            └─ Community profile, levels, history, and group leaderboard

Experience review and milestone verification
  └─ pending Experience XP award
       └─ participant explicitly redeems awards
            ├─ `users.xp` is updated transactionally
            ├─ award status becomes redeemed
            └─ an `xp_earned` activity event may be shared according to feed privacy
```

The workspace is a pnpm monorepo. The mobile app is Expo/React Native, the API is Express/TypeScript, data access uses Drizzle/PostgreSQL, and the contract/client flow uses OpenAPI, Zod, and generated React Query hooks. Existing migration files are additive SQL. The checked-in `post-merge.sh` also invokes Drizzle push, so any schema work must follow the project’s migration safety rules rather than applying a broad schema push to a live database.

### Current Experience XP lifecycle

1. A server-side action validates a qualifying event. Experience participation and milestone rewards are issued after host verification; clients do not decide the XP amount.
2. A row is inserted into `xp_awards` with a source type, source ID, title, amount, and pending status. The unique `(user_id, source_type, source_id)` index prevents the same source from being credited twice to the same profile.
3. `GET /me/xp-awards` returns the signed-in profile’s balance, pending awards, history, and compatible legacy records.
4. The participant taps the explicit redeem action. The redemption helper updates pending award rows and the profile balance inside a transaction, then creates the corresponding feed activity event.
5. Level and next-level progress are derived from the redeemed `users.xp` balance. Pending awards are not yet part of that balance.

The existing manual redemption step is part of the current user experience. New sources should preserve that contract unless a separate product decision changes it.

## B. Existing feature inventory

| Feature | Frontend | Backend / API | Database | Tests, current status, and limitations |
|---|---|---|---|---|
| Experience XP and levels | Profile shows level, XP progress, pending/redeemed award history, and a redeem button. `PersonalActivityScreen` also shows XP and award history. | `GET /me/xp-awards`, `POST /me/xp-awards/redeem`, `userResponse`, XP rules, and progression helper. Awards are profile-bound and redeemed explicitly. | `users.xp` plus `xp_awards`; a unique source index supports idempotency. | Rule, progression, redemption, and integration tests exist. The 5 levels and thresholds are hard-coded. The ledger has no general correction/reversal workflow or stored activity category/issuing organisation/verification actor. |
| Verified experiences and milestones | Experience join, submission, host-review, milestone, and XP-ready states are presented in the existing app. | Experience verification and milestone review award pending XP only after approval. Milestone totals are checked against the experience reward. | `experiences`, `participations`, `experience_milestones`, `experience_milestone_submissions`, `xp_awards`. | Experience/milestone rule tests exist. Joining or recording attendance alone is not equivalent to verified completion. No general mission, streak, or achievement evaluation is triggered by these events. |
| Telegram Community XP | `CommunityXpPanel` displays linked groups, member rank, contribution history, and group leaderboard. | Telegram contribution processing enforces minimum content, duplicate/rate limits, per-member and per-community caps, and admin adjustment rules. Community routes expose group, member, and management data. | Separate community member balance and contribution records; admin adjustments are auditable. | Community rule and message-policy tests exist. This reputation is per Telegram group and is not the Experience XP balance. Documentation is stale about the caps. |
| Memory Game | Game screen shows game progression and a separate leaderboard; the existing space-background asset contains the astronaut mascot. | Server owns attempts, validates the result, updates game stats, and adds up to the configured daily amount of official Experience XP. | `memory_game_stats`, `memory_game_attempts`, and `xp_awards`. | Memory Game rules and mobile-review tests exist. Game score/leaderboard and Experience XP are distinct. It is not a general learning or contribution progression engine. |
| Experience challenges | `ExperienceChallengesScreen` and Activity history expose a participant’s challenges. | Challenge APIs create, accept, and decline challenges tied to an experience. A challenge can complete when the invited friend already has verified participation. | `experience_challenges`, linked to the experience and two participant profiles. | Challenge rule tests exist. Challenges are one-to-one and experience-specific; they have no objectives, shared aggregate progress, or reward award of their own. |
| Accountability | Existing dashboard and partner flows support goals, commitments, check-ins, confirmation, encouragement, and notifications. | Authenticated APIs enforce active-partnership and ownership rules. Check-ins are self-reported and can be confirmed by the partner. | Partnership, goal, commitment, check-in, and notification tables. | Accountability rule tests exist. No XP or streak integration exists. A self-report alone is not suitable proof for a verified contribution reward. |
| Learning library | `LearningLibraryPanel` shows saved AI research and flashcard decks. | Learning routes provide profile-owned research and deck CRUD. | Learning research and deck tables. | No learning completion or assessment record was found. Saving or opening a resource does not currently prove completion or award XP. |
| Organisation operating progress | Organisation home displays four operating milestones and a next step. | `getOrganisationProgress` derives progress from organisation profile/readiness and hosted experience activity. Existing organisation/experience routes enforce ownership and review roles. | Uses existing organisation, experience, participation, and verification data; the four operating milestones are derived rather than a participant XP ledger. | Organisation progress tests exist. This is organisation setup/operation progress, not a personal development journey, league, or XP reward. |
| Activity, analytics, and notifications | Activity, feed, notification, community, and accountability screens use existing API hooks. | `activity_events` supports `xp_earned` and has an `achievement_unlocked` type, but no achievement-unlock producer was found. Analytics records screen/product events. Push delivery is currently tied to community updates. | Feed events/preferences, feed notifications, push tokens, and analytics events. | The only feed preference found is whether to share activity with friends; it is not a set of gamification notification preferences. No XP-category analytics, streak reminders, or recurring progression worker was found. |

## C. Existing gamification inventory

### Experience XP

- **Sources found:** email signup (currently 50 XP), verified experience participation using the host-configured reward, verified experience milestones using their configured reward, and successful Memory Game activity.
- **Balance:** `users.xp` is the redeemed Experience XP balance. Pending awards are stored separately until the user redeems them.
- **Idempotency:** the ledger’s unique profile/source key blocks repeated awards for the same source.
- **Progression:** five fixed levels: Explorer, Contributor, Champion, Leader, and Legend. Thresholds are currently 0, 500, 1,500, 2,500, and 5,000 XP.
- **History:** persisted awards and selected legacy verified experience/signup records are combined for the profile history.
- **Limits:** experience rewards are configured on the experience/milestone and are server-validated. The Memory Game’s official Experience XP contribution is capped at 50 XP per UTC day.
- **Important distinction:** the profile’s level is based on redeemed Experience XP. It does not include Community XP or pending awards.

### Community XP

- One XP is awarded for an eligible group message of at least seven words, subject to duplicate-content and rate checks.
- Current code caps a member at 250 lifetime XP in a group and positive group awards at 1,000 XP per UTC day. A participant is also limited to 20 eligible messages per minute.
- Admin adjustments are signed, limited to 1–20 XP per adjustment, and capped at 20 XP per recipient per admin per day. Negative corrections cannot take a member below zero.
- Community levels and leaderboard are per group. They use their own thresholds and labels.
- The contribution ledger records identifiers and a keyed message fingerprint rather than storing raw message text.
- **Documentation mismatch:** `docs/community-xp.md` describes a 100-XP group/day limit and a recipient group/day cap. Those values do not match current code.

### Other progression and recognition

- **Memory Game:** separate game XP/score and a Friends/Global game leaderboard; successful play also has a capped Experience XP award path.
- **Experience challenge:** social invitation around one experience; no challenge reward or shared quest objective.
- **Accountability:** paired goals and check-ins; no XP reward.
- **Experience milestones:** verified milestones can award their configured Experience XP.
- **Achievements:** no definition, progress, unlock, or profile-display engine found. `achievement_unlocked` is only a supported activity-event type.
- **Streaks:** no contribution streak model or calculation found.
- **Missions/quests:** no product mission model or progress engine found.
- **Personal journeys:** no structured, enrolable pathway with steps and completion rules found. The Activity screen is a history; organisation “operating journey” is a separate setup checklist.
- **Leaderboards/leagues:** there are Community XP rankings and Memory Game rankings, but no weekly Experience XP ranking or league system.
- **Reputation/credentials:** no portable verified credential system or single cross-product reputation score found. Experience XP is a non-cash progression balance, not a token or wallet asset.

## D. Integration matrix

| New feature | Existing system | Reuse | Extend | New code required |
|---|---|---|---|---|
| Unified Experience XP event handling | `xp_awards`, profile XP, experience/milestone verification, Memory Game award path | Existing ledger, balance, redemption, uniqueness constraint, and server verification | Source metadata/category and shared award entry point as justified; keep pending/redeemed behavior | Minimal event evaluation/dispatch; transaction/outbox only if existing source transactions cannot safely cover dependent updates |
| Contribution streaks | Verified participation, milestones, learning data, accountability activity | Existing server-side source records and user profile | Add explicit qualifying-action and timezone rules; do not count app opens or unverified claims | Streak state/day records, calculation, APIs, UI, and boundary/late-verification tests |
| Missions | Experiences, verification, learning resources, challenges, accountability, community contributions | Existing experiences, users, organisations, community ledger, and verification | Add mission progress from actual source records; do not let clients increment progress | Mission definition, objective, assignment/participant progress, completion, expiry, reward, and issuer permissions |
| Achievements | XP/verified source records and activity feed | Existing XP award and activity-event presentation where appropriate | Use common criteria evaluation; make unlocks idempotent | Achievement definitions, earned/progress records, API, profile/centre UI, and unlock events |
| Friends/accountability quests | `experience_challenges`, friendships, accountability partnerships/goals/check-ins | Existing relationships, invitations, verification, and notifications | Extend from a single experience invitation to multi-participant objectives and per-person/shared progress | Shared quest participants/objectives/progress; carefully scoped reward distribution and access controls |
| Community missions | Telegram community members/contributions and current group leaderboard | Community membership, contribution ledger, admin rules, and group UI | Add group-level objectives without combining Community XP with Experience XP | Community mission definitions, aggregate progress and completion records; document current caps accurately |
| Development journeys | Learning library, verified experiences, experience milestones, organisation progress | Existing resources, hosted experiences, participation and verification | Relate reusable existing activities to journey steps; preserve organisation operating milestones as their own feature | Journey templates/steps, enrolment/progress, completion criteria, APIs, and a mobile journey view |
| Organisation programmes | Organisation profiles, hosted experiences, participant review, organisation dashboard | Existing organisation ownership and verification workflows | Add programme/cohort management and reliable outcome summaries | Programme definitions, enrolments, permissions, progress, audit history, and organisation metrics |
| Weekly leagues and rankings | Community and Memory Game leaderboards; Experience XP ledger | Existing pagination and ranking patterns, but not their scoring systems | Add category and season rules after XP event classification exists | Weekly aggregation/snapshots, history, opt-in/privacy controls, promotion rules, and anti-farming tests |
| Astronaut progress feedback | Existing Memory Game astronaut artwork, XP profile, experience celebration provider | Reuse the existing visual identity and celebration conventions | Add contextual messages/states only where real progress events occur | Small accessible UI states; no separate mascot identity or new navigation tab |

`activity_events` is a social/feed presentation model, not a complete authoritative event bus: it does not represent every verified experience, learning action, or community contribution. Do not use it as the sole progression source. Prefer reading the authoritative domain records and writing rewards/progress idempotently in the same transaction when possible. Add a durable event/outbox layer only if a measured transaction or retry requirement justifies it.

## E. Database recommendations

### Reuse

- `users.xp` and `xp_awards` remain the source for the current Experience XP balance and award history.
- `participations`, `experiences`, `experience_milestones`, and `experience_milestone_submissions` remain authoritative for verified experience activity.
- `memory_game_stats` and `memory_game_attempts` remain authoritative for game performance.
- Community member/contribution tables remain the source for Community XP.
- Existing `experience_challenges`, accountability partnership/goal/commitment/check-in tables, learning research/deck tables, `activity_events`, and organisation/experience records should be linked rather than copied into a new parallel system.

### Extend carefully

- Add explicit XP category and source metadata only when a real award type requires it. Preserve the existing unique source key and existing redeemed balance.
- Add correction/reversal records and actor/reason data before introducing manual Experience XP adjustments.
- Make the definition of “earned this week” use the qualifying award/event time, not the later time a user redeems it.
- Keep community contribution balances and Experience XP separate. A mission can count community records without converting or copying Community XP.
- Store streak timezone semantics and qualifying event dates clearly; a server UTC date alone does not satisfy the supplied local-day requirement.

### New tables that are likely justified

- Mission definitions/objectives and participant assignment/progress/completion records.
- Achievement definitions and per-profile progress/unlock records.
- Per-profile streak state and qualifying-day records, if streaks need durable history or reliable late verification.
- Development journey templates/steps and participant enrolment/progress.
- Organisation programme/cohort records and participant progress, if programmes need separate ownership and reporting.
- League/season configuration and historical standings, if promotions and history must survive weekly resets.

Avoid a new `user_progression` balance or duplicate XP transaction ledger. Prefer projections from the existing ledger and explicit feature tables where the source data cannot express the feature. Add foreign keys, status checks, unique source/participant keys, and indexes for profile/status/time, active assignments, deadlines, organisation ownership, and paginated history. Use transactions for source verification, award insertion, and corresponding progress updates.

### Migration risks

- There are 37 additive SQL migration files, but none creates `xp_awards`; migration `0002_social_feed.sql` already assumes that table exists. The Drizzle schema declares it. Treat this as a pre-existing/base-schema dependency and verify the target before changing it; do not infer that the table is absent.
- The local schema does not prove which migrations have been applied to a development or production database. No database status was checked for this audit.
- Add migrations rather than using broad schema push for production. Do not modify production data or apply migrations as part of planning.
- Preserve all existing XP and historical event timestamps. Any threshold change must map existing balances without resetting users or silently lowering levels.

## F. API recommendations

### Reuse

- Reuse `GET /me/xp-awards` and `POST /me/xp-awards/redeem` for profile-scoped Experience XP history and redemption.
- Extend verified experience and milestone review actions so eligible event processing can update XP, missions, achievements, and streaks safely.
- Reuse existing challenge, accountability, learning, Memory Game, community, and organisation routes for their source data and permission checks.
- Keep Community XP routes and balances separate from Experience XP routes.

### New API surface likely required

Introduce authenticated route families for the signed-in participant’s progression summary, active missions and mission details/progress, achievements and achievement progress, streaks, and enrolled development journeys. Add organisation-scoped programme/mission management endpoints with server-side ownership checks. Add paginated weekly league/ranking endpoints only after ranking and privacy rules are defined.

New API contracts should be added to `lib/api-spec/openapi.yaml`, validated through the repository’s Zod/OpenAPI flow, and regenerated with Orval into `lib/api-client-react`. Do not hand-edit generated client files. No new endpoints or generated files were changed in this audit.

All award amounts, mission progress, verification status, user identity, organisation ownership, and ranking eligibility must be calculated or checked server-side. Client-supplied progress or XP is never authoritative.

## G. Frontend recommendations

### Reuse and extend

- Extend the existing profile XP summary and `PersonalActivityScreen` rather than adding a separate app or a new primary navigation tab.
- Reuse `ExperienceChallengesScreen`, accountability screens, `CommunityXpPanel`, `LearningLibraryPanel`, the Memory Game, organisation home, and notification surfaces for feature-specific entry points.
- Reuse existing loading/error/retry patterns, React Query hooks, accessible progress labels, and celebration provider.
- Keep the four organisation operating milestones distinct from participant development journeys.

### New UI required

- A focused participant progression view with current level, current/pending XP, meaningful next action, streak summary, active missions, and achievement progress. Keep it mobile-first and do not overload the existing profile with a dense dashboard.
- Mission detail/progress and completion feedback.
- Achievement list/detail with locked, in-progress, and unlocked states.
- Streak calendar/summary with understandable timezone and late-verification rules.
- Social quest shared progress and individual contribution views.
- A visual development journey map and organisation programme management/progress.
- Weekly league and category ranking screens only after privacy, scoring, and reset rules are agreed.

The existing `memory-game-space-background.png` contains an astronaut illustration. It can anchor new progress states if suitable, but a full set of idle/encouraging/celebrating illustrations was not found. The welcome panorama contains a different legacy visual mark and should not be treated as the astronaut asset. Do not create a second mascot identity or use XP as a cash/token claim.

## H. Risks and safeguards

| Risk | Why it matters | Recommendation |
|---|---|---|
| Duplicate XP or progress engines | Experience XP, Community XP, Memory Game score, and organisation milestones already have different semantics. | Keep one Experience XP ledger; preserve separate community/game/organisation measures. Document every conversion explicitly if one is ever approved. |
| XP inflation and weak incentives | Signup and a digital game already contribute Experience XP; message XP can encourage spam if copied into general XP. | Define eligible outcomes and caps before implementation. Reward verified participation and useful learning, not app opens, raw message volume, or arbitrary self-reports. |
| Redemption timing distorts progression | Current levels use redeemed XP, while awards have their own event timestamps. | Keep award and redemption semantics explicit. For weekly metrics, attribute points to the verified source event, not the user’s redeem-button timing. |
| Late or duplicate source events | Host review, callbacks, retries, and simultaneous submissions can repeat processing. | Preserve unique source keys; make all downstream mission/streak/achievement updates idempotent and transaction-safe; test concurrency. |
| Verification quality | Attendance, self-reported check-in, learning-resource saves, and verified completion are not equivalent. | Only award based on server-verifiable criteria. Do not treat a saved deck or unconfirmed check-in as completed learning/contribution. |
| Timezone and streak disputes | Local-day boundaries, late host approval, and missed days affect streak fairness. | Define timezone, qualifying date, late verification, freeze, and reset behavior before implementation; never infer a day from app activity. |
| Community documentation drift | Docs currently describe caps that code does not enforce. | Correct the docs alongside any Community XP/mission work and test documented limits against code. |
| Permissions and privacy | Organisation-authored missions and shared progress expose participant data. | Enforce role/ownership and visibility on the API; keep private goals private; add privacy defaults for rankings and social recognition. |
| Schema uncertainty | The incremental migration history assumes `xp_awards` is already present and has no record of current DB application state. | Inspect the target schema and migration status before adding or applying migrations. |
| Leaderboard farming | Lifetime totals and volume-based ranking can reward repetitive or low-quality activity. | Use verified, category-aware weekly scoring, meaningful caps, pagination, privacy controls, and auditability; defer leagues until source categories exist. |
| Notifications and analytics are incomplete | Current push delivery is community-focused, and no gamification preference categories were found. | Add minimal, actionable event types and user preferences; avoid pressure-based streak notifications and measure verified participation, not app opens. |
| Level/reward migration | The prompts include proposed reward amounts and ten names, while the live system has five established levels. | Keep current balances and thresholds until the product approves a mapping. Do not hardcode the example reward table as final policy. |
| Generated contracts drift | OpenAPI and generated hooks exist, but codegen was not run in this audit. | Run the official generation/typecheck flow for each implementation phase and verify the resulting diff. |

## I. Implementation roadmap

This order keeps the verified source data and Experience XP ledger as the foundation. Suggested XP values, ten-level names, league divisions, streak freezes, and token/chain ideas remain proposals until approved.

### Phase 1 — Core participant progression

- Agree the qualifying event categories, reward configuration, timezone behavior, and whether current five levels remain or are mapped to a new scale.
- Extend the existing Experience XP source handling without a second balance/ledger; preserve idempotency and manual redemption semantics.
- Add the minimal event evaluation required for streaks, achievements, and core daily/weekly missions. Derive progress from authoritative source records.
- Add a focused participant progression surface in existing profile/activity navigation, with useful loading, empty, error, and accessible progress states.
- Add event history, preference-aware feedback, and meaningful analytics without counting app opens as progress.
- Test source attribution, duplicate/concurrent events, late verification, timezone boundaries, completion, redemption interaction, and preservation of existing XP.

### Phase 2 — Social quests and community participation

- Extend experience challenges and accountability partnerships into multi-person objectives with individual and collective progress.
- Add community-level objectives using the existing community contribution ledger while retaining separate Community XP balances and rules.
- Add permission checks, opt-in visibility, fair reward distribution, deduplicated notifications, and social quest tests.
- Correct `docs/community-xp.md` to match the current 250 lifetime member cap, 1,000 community daily cap, and admin limits.

### Phase 3 — Development journeys and organisation programmes

- Add reusable journey templates/steps and participant enrolment using existing experiences, verified milestones, and learning resources.
- Add organisation-authored programmes with ownership checks, participant progress, and reliable completion/impact measures.
- Introduce real learning completion criteria before treating learning resources as completed steps or awarding learning XP.
- Keep organisation operating milestones separate. Defer mentoring/portfolio rewards until those activities have real workflows and verification.

### Phase 4 — Weekly competition

- Define category scoring, weekly boundaries, privacy/opt-in, season history, promotion/demotion, and anti-farming rules.
- Add paginated weekly Experience XP rankings and league history using event-time awards, not manual redemption time.
- Keep existing Community and Memory Game leaderboards distinct unless the user approves a shared ranking model.

### Deferred advanced work

Portable credentials, on-chain attestations, Solana records, and token integration are not prerequisites for the progression features above. Revisit them only when a specific portability or verification need justifies the added complexity. Experience XP remains a non-cash application metric.

## Source files inspected

- `artifacts/api-server/src/lib/xp-award-rules.ts`
- `artifacts/api-server/src/lib/xp-progression.mjs`
- `artifacts/api-server/src/lib/xp-award-redemption.mjs`
- `artifacts/api-server/src/lib/community-rules.ts`
- `artifacts/api-server/src/lib/contribution.ts`
- `artifacts/api-server/src/lib/memory-game-rules.mjs`
- `artifacts/api-server/src/lib/challenge-rules.mjs`
- `artifacts/api-server/src/lib/accountability-goal-rules.mjs`
- `artifacts/api-server/src/lib/organisation-progress.mjs`
- `artifacts/api-server/src/routes/experiences.ts`
- `artifacts/api-server/src/routes/challenges.ts`
- `artifacts/api-server/src/routes/accountability.ts`
- `artifacts/api-server/src/routes/learning.ts`
- `artifacts/api-server/src/routes/memory-game.ts`
- `artifacts/api-server/src/routes/community.ts`
- `artifacts/api-server/src/routes/feed.ts`
- `lib/db/src/schema/xp-awards.ts`
- `lib/db/src/schema/community.ts`
- `lib/db/src/schema/experience-challenges.ts`
- `lib/db/src/schema/accountability.ts`
- `lib/db/src/schema/social-feed.ts`
- `lib/db/migrations/0001_social_invites.sql` through `0037_telegram_community_welcome_messages.sql`
- `lib/api-spec/openapi.yaml`
- `lib/api-client-react/src/generated/api.ts`
- `artifacts/mobile/app/index.tsx`
- `artifacts/mobile/components/PersonalActivityScreen.tsx`
- `artifacts/mobile/components/ExperienceChallengesScreen.tsx`
- `artifacts/mobile/components/CommunityXpPanel.tsx`
- `artifacts/mobile/components/OrganisationHomeScreen.tsx`
- `artifacts/mobile/assets/images/memory-game-space-background.png`
- `docs/community-xp.md`
