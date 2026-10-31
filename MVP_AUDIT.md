# Experiences.fun MVP audit

**Audit date:** 31 October 2026  
**Scope:** Read-only review of the mobile Expo app, Express API, shared contracts and database schemas/migrations, Telegram bot, Solana flows, available automated tests, and configured local preview.

## Evidence rules and limitations

- “Implemented” means code, route wiring, schema, or a test exists. It does **not** mean the live service works end to end.
- Automated browser tests in this audit intercepted API calls and supplied fixtures. A passing test therefore verifies the tested UI interaction and request shape, not real database persistence or external-service delivery.
- Production database queries, migrations, real Telegram actions, and wallet transactions were not performed. Production schema state, live Telegram administration rights, Maps key restrictions, and live chain behavior remain unverified.
- The existing dirty file `artifacts/mockup-sandbox/src/.generated/mockup-components.ts` was preserved. No application code, database schema, migration, or data was changed during the audit.
- Findings distinguish confirmed source-level defects from unverified operational risks. No fix is implemented in this report.

## Report A — Executive summary

### Overall assessment

Experiences.fun is a **broad, substantially implemented MVP codebase, but not yet production-verified as a complete ecosystem**. It has a mobile client, a substantial API, shared request/response contracts, profile-bound authentication, persisted social and participation models, a Telegram bot, and non-custodial Solana fundraising flows. Many important operations include server-side validation, ownership checks, database transactions, uniqueness constraints, or idempotency safeguards.

The product loop is represented in code: discover experiences, join, record attendance/completion, submit evidence, host review, issue/redeem XP, and display activity. Organisation operations, social connections, accountability, challenges, Memory Game, AI suggestions, community tooling, and charity fundraising also have UI and API paths. However, the audit could not safely prove these journeys against the intended production database and external services.

**Release position:** do not treat this as a verified production-ready MVP until the static-file path containment defect is addressed, the high-severity dependency findings are triaged, the intended database migrations are confirmed in the target environment, and the critical participant/host/financial journeys pass a controlled end-to-end release check.

### What is genuinely evidenced

- The mobile app and API development workflows were running. The API build completed and listened on its configured port; the mobile Expo/Metro preview bundled.
- Workspace TypeScript checking passed in the earlier audit phase.
- Thirty-two isolated API unit-test files passed (142 tests); database integration suites were deliberately excluded because they may write to the configured Supabase database.
- API auth-routing tests passed 2/2.
- Mobile email/Telegram-auth interaction tests passed 6/6 on the latest run. The signup path used intercepted API responses and did not create production data.
- Mobile organisation-host interaction tests passed 5/5, including experience management and charity fund/treasury UI interactions using mocked responses.
- Seven additional isolated mobile logic groups passed 27/27 tests (organisation onboarding copy, Solana payment URI validation, fundraising format/list helpers, location resolution, Memory Game answer review, and home-priority selection).
- Important server routes consistently bind operations to the authenticated profile and apply role/ownership checks in reviewed areas. Fundraising uses a donor-approved transfer flow; the server does not sign transfers for charities.

### Confirmed issues and important uncertainty

1. **High — static-file path containment check is boundary-unsafe.** `artifacts/mobile/server/serve.js:49-56` uses `filePath.startsWith(STATIC_ROOT)`. A local non-network path simulation confirmed that a resolved sibling path can pass this prefix check. Whether an attacker can retrieve a useful sibling file in the deployed layout is conditional and was not verified. Treat this as a release security fix.
2. **High dependency findings need triage.** The completed dependency scan reported 0 critical, 12 high, 12 moderate, and 7 low findings. High findings included `body-parser`, `decode-uri-component`, `markdown-it`, `node-forge`, Vite, and Zod in the lockfile. The actual reachable paths and deployed versions were not verified here.
3. **SAST reported one additional high and one medium item.** The high item was the static-file path guard above. The Maps browser key configuration was also flagged; its value is omitted. A browser Maps key is expected to be client-visible, so confirm API/referrer restrictions rather than treating visibility alone as proof of a secret leak.
4. **Two mobile interaction harness failures are repaired; the keyboard flow exposes a separate focus issue.** Home now waits for the Posts query’s empty state, and Explore explicitly mocks the saved-experiences request while still rejecting other unknown requests; both suites passed twice. The keyboard profile fixture now includes the required OpenAPI fields, but repeated mobile Chromium preview runs lose focus from the profile name field during scrolling. This behavior has not been verified on an iOS or Android device, and no app behavior was changed.
5. **Runtime readiness is not established.** The production migration state and end-to-end persistence for profile/auth, participation, XP redemption, evidence storage, Telegram, and Solana remain unverified. Migration files exist in the repository; their presence does not establish that they are applied in the intended production database.

### Immediate priorities

- Correct the static-root path boundary check and add regression coverage.
- Review and patch the dependency findings with compatibility checks.
- Confirm the approved migration set is applied to the intended database, without applying migrations as part of this audit.
- Repair the stale/flaky interaction tests, then run complete critical journeys against an isolated staging environment with test accounts and non-production external-service configuration.
- Verify Maps key restrictions and Telegram bot/group permissions operationally.

## Report B — Feature inventory

“Partial” indicates meaningful implementation with an incomplete journey, external dependency, or unverified persistence. Tests listed here are tests actually executed during this audit unless explicitly marked “not run”.

| Feature | User type | Frontend | API | Database | Testing/evidence | Status |
|---|---|---|---|---|---|---|
| Email and Telegram authentication | Participant, organisation | Welcome, account type, login/signup flows in `artifacts/mobile/app/index.tsx` and `AuthContext` | Public auth routes in `artifacts/api-server/src/routes/experiences.ts:260-399`; protected route auth middleware | Profile and expiring session records; profile-bound sessions | Mobile auth interactions 6/6; API auth-routing 2/2. Auth integration against real persistence not run. | **Partially complete** |
| First-run participant onboarding and profile | Participant | Multi-step onboarding and profile editing | Profile read/update routes; account switching routes | User/profile and identity relationships | Typecheck passed; real account creation/persistence not verified. | **Partially complete** |
| Organisation onboarding and profile | Organisation | Supported-type introduction and profile editor | Organisation/profile routes and verification routes | Organisation, verification application/evidence | Onboarding-copy tests 2/2; runtime review/approval not tested. | **Partially complete** |
| Organisation verification | Organisation, platform administrator | Application and status UI exist | Server-side verification submission/review paths were inspected | Verification applications and evidence migrations exist | No privileged review journey or production migration status verified. | **Not verified** |
| Explore, search, map and location | Participant, public visitor | Globe/map, category/search and nearby Places UI | Experience and city activity endpoints; Google Maps/Places client integration | Experience locations and city-level activity | Explore interaction test failed only at stale saved-experiences assertion; live Maps test skipped unless explicitly enabled. Maps key restrictions unverified. | **Partially complete** |
| Experience creation, editing and publishing | Organisation | Guided creation and host management screens | Create/update/cancel and host routes | Experiences tied to organisation, milestones and participants | Host interaction tests 5/5, with mocked API responses. Database persistence not verified. | **Partially complete** |
| Join, waitlist, leave and host participant management | Participant, organisation | Experience details and host participant controls | Join/leave/waitlist and participant-management routes; e.g. `experiences.ts:1439`, `1551-1635` | Participation relationship and status fields | Host management browser test passed; concurrent/production paths not tested. Existing project tasks separately track cancellation and duplicate-request cases. | **Partially complete** |
| Attendance, completion, evidence and review | Participant, organisation | Attendance, completion submission, private evidence upload/access, host review | `experiences.ts:1636+`; `private-evidence.ts:41-...`; review operations | Participation, evidence, review history | API unit tests passed, but DB integration and signed-object-storage journey not run. | **Partially complete** |
| XP awards, balance and redemption | Participant | XP panels, signup reward and redemption UI | `/me/xp-awards` and redeem route in `experiences.ts:1042-1117` | Award ledger and profile balance | XP rules tests included in API unit suite; signup UI test passed with mocked award response. Balance consistency/persistence not verified. | **Partially complete** |
| Personal activity, saved experiences and memories | Participant | Activity, saved lists, private memories, posts tabs | Activity, collections and profile-post routes | Activity events, saved collections and memories; migrations include `0026_personal_collections.sql` | Home-prompt test failed at an immediate empty-post assertion; test did not wait for the query to finish. | **Partially complete** |
| Social feed, posts, comments and reactions | Participant, organisation | `SocialFeed` and `ProfilePosts` | Feed, preference, post, reaction and comment routes in `feed.ts:342-883` | Feed events, posts, reactions, comments, preferences | No live persistence test run. API enforces supported visibility and explicitly rejects community sharing at `feed.ts:666-668`. | **Partially complete** |
| Friends, requests and notifications | Participant | Friend screens, requests and notifications | Friend/request/notification routes in `experiences.ts:3065-3346`; notification routes in accountability | Friendship and notification records | Route/source reviewed; no end-to-end delivery test run in this phase. | **Partially complete** |
| Direct messages | Participant | Inbox, conversation and message screens | Direct-message routes and profile-bound message queries | Conversations and messages | Source reviewed; no live delivery or notification test run. | **Not verified** |
| Accountability partnerships, commitments and check-ins | Participant | `AccountabilitySection` | `/accountability` routes, including notification updates | Partnerships, commitments, check-ins and notifications; goals migration `0027_accountability_goals.sql` | API rules tests passed. No production schema check or complete two-account journey. | **Partially complete** |
| Personal goals | Participant | Goals panel and goal-linked steps | Accountability API | `accountability_goals` and nullable goal links in migration 0027 | No DB integration or cross-profile privacy journey run. | **Not verified** |
| Experience challenges | Participant | Challenge screen and activity links | `challenges.ts:97-359`; validates accepted participant friendship and open experience; server-side recipient checks | Challenge rows, pair/status uniqueness | Challenge rule unit tests passed. Challenge UI/E2E flow not run. | **Partially complete** |
| Memory Game | Participant | `MemoryGameScreen` | `memory-game.ts:272-963`; per-user attempt ownership and transaction-locked progression | Per-user stats/attempts, active-attempt uniqueness | Answer-review tests 2/2; route code binds attempt IDs to `currentUser(req).id`. DB score-isolation test not run. | **Partially complete** |
| AI assistant | Participant | `AiAssistantScreen` with confirmed action suggestions | `ai-assistant.ts:23-369`, participant-only; conversations scoped to current user; rate-limited messages | Persistent conversations/messages/actions | No live AI integration test. Model service and integration availability were not verified. Mutations are proposals requiring user confirmation. | **Partially complete** |
| Charity treasury | Charity | Balance, activity and ledger UI | `funds.ts:78-166`; treasury owner/charity checks and Solana RPC reads | One treasury per charity; append-only deposit ledger | Host interaction suite passed mocked treasury screens. No live RPC read or migration check. | **Partially complete** |
| Campaigns and milestones | Charity, donors | Campaign list, create/edit, tracker, outcome reports | `funds.ts:168-355`; contribution routes | Funds, optional experience links, milestone and outcome-report tables | Campaign list/format tests 7/7; host campaign UI test passed with mocks. Live donor-to-chain lifecycle not run. | **Partially complete** |
| Donor contribution and verification | Donor, charity | Wallet-approved checkout and contribution history | `fund-contributions.ts:41-141`; pending intents, finalized transfer matching and ledger recording | Contribution/deposit records with unique transfer constraints in migration 0019 | Payment URI tests 4/4; no real transaction or production DB write. | **Partially complete** |
| Volunteer payout proposals and verification | Charity, participant | Candidate selection, proposal, cancellation and signature verification | `fund-payouts.ts:43-161`; verifies treasury, recipient, exact amount, memo and finalized transfer | Proposed/cancelled/paid payout records | No external multisig or chain transaction was executed. Payout signers remain external. | **Partially complete** |
| Telegram group connection and moderation | Organisation, community members | Community dashboard, phrase/link rules and riddles UI | `community.ts:42-343`; Telegram client and bot in `lib/telegram.ts` | Community ownership, rules and riddle configuration migrations 0021-0025 | Host test verifies setup UI only. Live bot membership, admin rights, message deletion and XP effects not tested. | **Requires external configuration** |
| Telegram community XP and leaderboard | Community members, managers | Community XP panel and manager dashboard | Bot update handling, community routes and XP logic | Community members/contributions/XP | Unit rules tests passed; no live group message or bot-admin journey. | **Requires external configuration** |
| Platform administration | Platform administrators | Admin surfaces exist in the app | Privileged review routes were inspected for server-side checks | Verification/audit-related records | No administrator account or privileged live journey used. | **Not verified** |
| Analytics | Platform, organisations | Activity summaries and organisation metrics | Explore activity and analytics endpoints | Event records and aggregates | API development workflow returned a local explore-activity response; no analytics correctness or production data check. Some UI explicitly says time-range filters are unavailable (`OrganisationFundsScreen.tsx:1903`). | **Partially complete** |
| Notifications and automated messages | Participants, hosts, community managers | In-app notification surfaces | API-generated notification records and Telegram notification functions | Notification and event records | No end-to-end Telegram delivery or multi-user notification read/unread check run. | **Not verified** |

## Report C — User journey audit

| Journey | Actual implementation and successful evidence | Gap / stopping point | Completion status |
|---|---|---|---|
| New participant: register → profile → discover → join → contribute → earn | Email signup, login, Telegram login selection and reward UI are present; auth interaction suite passed 6/6 using intercepted API responses. Experience, participation, evidence and XP endpoints are wired. | A real account/session write, participation persistence, signed evidence access, host notification, review, XP balance update and activity reflection were not exercised as one journey. | **Partially implemented; end-to-end persistence not verified.** |
| New organisation: register → verification → create experience → manage participants | Onboarding-copy checks passed; host-management tests passed 5/5 against mocked routes. API contains organisation/verification and host operations. | No live review/approval by an authorized administrator; no verification-dependent access journey or production migration check was performed. | **Partially implemented; verification gate unverified.** |
| Experience creation: enter details → publish → edit → manage participants | Guided UI and server create/update flows are present. Browser host tests cover publishing and participant management. | Tests do not prove that submitted data is persisted by the target database or remains correct after reload. Full creation coverage against a disposable DB was not run. | **UI/API path evidenced; data persistence unverified.** |
| Verified contribution: join → attend → submit → host review → XP | Routes, participation status transitions, evidence upload/access, review history and XP ledger exist. Rules and unit tests passed. | No safe end-to-end DB journey was run; duplicate/resubmit behavior and participant/host notification delivery remain unverified in the target environment. | **Partially implemented; key integration proof outstanding.** |
| Organisation collaboration | Partnership UI and API are present and require the counterpart organisation/owner relationship. | Invitation, acceptance, visibility on both organisations, original host attribution, duplicate requests and concurrent requests were not exercised here. | **Not verified end to end.** |
| Accountability partner: invite → accept → goals → commitments → check-ins → end | Routes, UI and rule tests exist; goal schema is represented in migration 0027. | Complete two-profile flow and target migration state were not checked. Notification/encouragement delivery and termination effects were not proven. | **Partially implemented; persistence/runtime unverified.** |
| Fundraising: treasury → campaign → donor payment → verification → reporting | Charity/treasury ownership checks, wallet payment request creation, finalized-chain verification, ledger sync, campaign milestones and outcome reporting are implemented. UI and isolated payment/campaign tests passed. | No real wallet or chain transaction was sent. No RPC verification or target DB write was performed. Campaign and ledger migrations must be confirmed as applied before release. | **Code path present; live financial lifecycle unverified.** |
| Volunteer payout: candidate → proposal → external transfer → verify | Proposal/cancel/verify routes and UI are present. The API checks the proposal memo and exact finalized transfer before marking paid. | The multisig signing and chain transfer happen outside Experiences.fun and were deliberately not performed. Funding availability and payout history remain unverified against live chain data. | **Non-custodial workflow implemented; external execution unverified.** |
| Telegram community: connect → verify → bot activity → moderation | API verifies public group membership using Telegram, has manager ownership checks, and provides bot/moderation logic. | Requires valid bot configuration and administrator permissions. No group was connected and no moderation action was triggered during this audit. A saved review inbox is explicitly unavailable (`TelegramCommunityManagementScreen.tsx:474`). | **Requires external configuration; live journey unverified.** |
| Social networking: request → accept → conversation → message → notify | Friend, conversation, message, feed, reaction and comment routes/UI are present and profile-scoped. | No two-account live delivery test was run. Home interaction script’s later post assertion failed before the full script completed; the test does not wait for the post query to settle. | **Partially implemented; delivery/persistence not verified.** |
| XP and reputation: qualifying action → award → balance → history | Award ledger and progression logic exist; signup reward UI displayed a pending award in the mocked auth flow. Duplicate-prevention and XP rule tests are present and were included in passing API unit tests. | Actual award-to-profile-balance atomicity and redemption against the target DB were not verified; separate project tasks track additional profile-binding and failure cases. | **Partially implemented; DB consistency unverified.** |
| AI assistant: ask → retrieve → propose → confirm | Participant-only assistant stores conversations and messages, looks up real experiences/friends, and produces action proposals. Server prompt explicitly prevents unconfirmed joins/challenges. | AI provider availability, streaming reliability, context recovery after provider errors, and a complete user-confirmed action were not tested against the live integration. | **Partially implemented; external service unverified.** |
| Memory Game: start → play → submit → persist score → leaderboard | Per-user attempts, user-bound attempt queries, transactional player locking and score/leaderboard routes exist. | Only isolated answer-review logic ran; no route-level persistence or leaderboard journey was executed. | **Backend implementation present; runtime score journey unverified.** |

## Report D — Interaction audit

This is a list of the most consequential interaction findings from inspected flows and executed tests, not a claim that every UI element on every screen was individually exercised.

| Screen/component | Evidence | Expected vs observed | Priority / disposition |
|---|---|---|---|
| Static web asset serving — `safeStaticPath` | `artifacts/mobile/server/serve.js:49-56` | The guard compares path strings with `startsWith(STATIC_ROOT)`. A local path simulation confirmed a resolved sibling path can pass the check even though it is outside the static root. Deployed sibling-file exposure is conditional and unverified. | **P0 security fix before release.** |
| Personal Activity → Posts — `ProfilePosts` | `artifacts/mobile/components/ProfilePosts.tsx:38-45,60-82,117-122`; test `home-prompt-interaction.test.mjs:965-978` | The test now waits for the rendered empty state after the mocked query settles. The Home prompt/Activity suite passed twice; no Posts defect was observed. | **P2 test-race repair applied.** |
| Profile edit keyboard flow | `keyboard-interaction.test.mjs:16-41,647-675`; API User contract `lib/api-spec/openapi.yaml:4454-4488` | The fixture now includes the required progression fields and the profile editor renders. In repeated touch-based Chromium preview runs, scrolling changes focus from `profile-edit-name` to `profile-menu-toggle`, failing the retained-focus assertion. This is a separate browser interaction finding, not the former fixture error; iOS/Android behavior remains unverified. No app behavior was changed. | **P2 investigate separately; preserve the assertion and verify on device before classifying as a native defect.** |
| Explore → experience detail | `explore-globe-interaction.test.mjs:1182-1186`; Explore query at `artifacts/mobile/app/index.tsx:3140` | The mock now returns an empty list for the implemented `GET /api/me/saved-experiences` request and still returns 404 for other unknown API calls. The Explore suite passed twice; the live Maps test remained skipped because it was not enabled. | **P2 test expectation repair applied.** |
| Telegram moderation dashboard | `artifacts/mobile/components/TelegramCommunityManagementScreen.tsx:474` | The UI explicitly says a saved review inbox is not available; automatic phrase/link removals depend on Telegram permission to delete messages. | **P2 if moderation review is a launch requirement; otherwise clearly scoped limitation.** |
| Organisation analytics metric | `artifacts/mobile/components/OrganisationFundsScreen.tsx:1903` | User can inspect all-time totals; the UI explicitly states time-range filters are unavailable. | **P3 enhancement; not an MVP blocker by itself.** |
| Social feed community visibility | `artifacts/api-server/src/routes/feed.ts:659-668` | The API rejects `visibility: "community"` and directs callers to friends/public. This is an explicit limitation; verify the client offers only supported choices. | **P2 contract/UI consistency check if community posting is in scope.** |
| Signup reward rendering | `email-signup-login.test.mjs:651-770` | The latest mocked signup flow reached congratulations and showed the pending +50 XP reward; 6 auth cases passed. This does not prove the live reward is committed to the database. | **No defect observed in tested UI path; persistence remains unverified.** |
| Charity campaign creation and treasury UI | `host-management-interaction.test.mjs` tests; API `funds.ts:78-165,276-355` | Five host UI tests passed with mocked responses. No chain or live database call was made. | **No defect observed in tested UI path; end-to-end effects remain unverified.** |

## Report E — API and database audit

### Architecture and data flow

1. **Frontend:** `artifacts/mobile` is an Expo Router application, also served as a web app for the Telegram Mini App. `app/index.tsx` owns the main screen/navigation state and composes focused screens/components. It calls hooks generated from the shared OpenAPI client.
2. **API:** `artifacts/api-server` is an Express service. `src/routes/index.ts:20-40` mounts health, experiences/auth, accounts, social, direct messages, challenges, AI, Memory Game, funds, evidence, collections, accountability and community routes.
3. **Contracts:** `lib/api-spec/openapi.yaml` supplies the API contract; `lib/api-client-react` and `lib/api-zod` contain generated client and validation types. Reviewed routes such as profile posts and fundraising have corresponding OpenAPI/client entries. Workspace typecheck passed; a complete generated-vs-route parity diff was not run.
4. **Authentication and identity:** Telegram and email sign-in create authenticated sessions bound to a selected profile. Auth routes are intentionally reachable before protected route middleware; protected handlers use the current authenticated profile and role/ownership checks. Direct identity-group merging is not implicit.
5. **Core relationships:** users own participant or organisation profiles; organisations own experiences; participants have per-experience participation records; XP is represented by an award ledger and profile progression fields.
6. **Fundraising:** a charity has one registered public treasury wallet. Campaigns optionally link to an experience. Donor payment intents carry unique references; finalized chain transfers are verified before deposits/contributions are recorded. Payout proposals are tracked in-app, while multisig approval and signing remain external.
7. **Telegram:** organization-owned communities are linked to Telegram chat IDs and configured moderation/riddle rules. Bot polling is protected by a database advisory lease in updated API instances; local logs confirmed polling was disabled in this development process.
8. **Social and notifications:** feed events, posts, comments/reactions, friendships, conversations/messages and notifications have dedicated routes and database records. Notifications may be in-app or sent through Telegram, depending on the flow.

### Data integrity and schema evidence

- The repository contains **27 ordered SQL migration files** (`lib/db/migrations/0001` through `0027`), including social feed, challenges/AI, Memory Game, funds/treasuries, private evidence, contribution ledger, Telegram moderation, personal collections and accountability goals.
- Migration 0019 uses unique transfer/reference indexes, foreign keys and status/amount checks for contributions, deposits and payouts (`lib/db/migrations/0019_fund_contribution_ledger.sql:6-60`).
- Campaign milestones and reports use foreign keys, uniqueness/length/status checks (`0023_fund_campaign_milestones.sql`, `0024_fund_milestone_outcome_reports.sql`).
- Memory Game attempts are user-bound in route queries and updates, with transaction locking and a unique active-attempt index (`memory-game.ts:300-411`, migration `0010_memory_game.sql:62-103`).
- Challenge creation validates an accepted friendship and eligible experience; the database has an active-pair uniqueness constraint (`challenges.ts:159-250`, migration `0008_experience_challenges_ai_assistant.sql`).
- Fund creation and milestone creation run within one transaction (`funds.ts:314-332`). Contribution verification matches finalized transfer details and records the deposit before refreshing the profile contribution (`fund-contributions.ts:104-141`).
- Several rate limits are in-memory maps in API route modules (`fund-contributions.ts:20-27`, `fund-payouts.ts:18-19`, `ai-assistant.ts:26-64`). They are process-local, so they are not a shared limit across multiple replicas or restarts; production deployment topology and abuse controls need confirmation.
- The fundraising routes return an explicit 503 when required database tables/columns are absent (`funds.ts:357-366`). This is a useful staged-migration guard, but does not establish that production has the migrations.
- Production migration state and data integrity were **not queried**. No schema push or migration was run.

### API and contract conclusions

- The major reviewed feature surfaces have both UI and API entry points; no systemic “screen with no API” or “API with no UI” finding was established from this inspection.
- The OpenAPI contract, generated clients and typecheck provide useful alignment checks. They do not prove response semantics, persistence, authorization under real sessions, or route coverage.
- One explicit limitation to reconcile is unsupported community-visibility posting: `feed.ts:666-668` rejects it. It should not be represented as an available client action unless the backend contract is implemented.
- Staged schema-dependent features must be checked against the intended production migration state before launch. The audit did not infer migration status from local files or successful local app startup.

## Report F — Security audit

### Findings

| ID | Severity | Finding and evidence | Impact / recommended remediation |
|---|---|---|---|
| SEC-1 | **P0 — Critical, conditional exposure** | `artifacts/mobile/server/serve.js:49-56` checks `filePath.startsWith(STATIC_ROOT)` rather than a path-segment boundary. A local non-network simulation confirmed a resolved sibling path can satisfy the check. Whether a useful sibling file is present in the deployed filesystem was not verified. | Replace with a robust containment check based on `path.relative` (reject absolute/`..` results) and, where relevant, real paths; test sibling-prefix and traversal cases without reading arbitrary files. Confirm the deployed bundle layout before release. |
| SEC-2 | **P1 — High dependency findings** | Dependency scan: 12 high, 12 moderate, 7 low, 0 critical. High findings included `body-parser`, `decode-uri-component`, `markdown-it`, `node-forge`, Vite and Zod in the lockfile. | Map each advisory to resolved dependency/version and reachable use; patch or document accepted risk, run unit/type/build tests, and verify the deployed lockfile. This audit did not install or upgrade packages. |
| SEC-3 | **P1 — Configuration verification** | SAST reported the configured Google Maps browser key in `.replit` (value intentionally omitted). It is used as a client-side key; client visibility alone is not proof of compromise. | Verify the key is restricted to the required Maps/Places APIs and approved web origins/referrers, monitor usage, and rotate only if restrictions or exposure history require it. Restrictions were not inspected. |
| SEC-4 | **P2 — Distributed rate limiting** | Assistant and payment verification throttles use process-local `Map` state (e.g. `ai-assistant.ts:26-64`, `fund-contributions.ts:20-27`). | If the API is scaled to multiple processes, use shared rate limiting and keep resource-specific limits. Not a confirmed exploit in the current deployment. |

The SAST scan also reported one medium finding. Its precise exploitability was not independently established in this phase; retain it in the scan report for triage rather than promoting it to a confirmed defect.

### Controls observed in reviewed paths

- Sensitive API routers apply authentication middleware; route-specific handlers validate participant/organisation role, ownership and resource membership.
- Memory Game attempt reads/submissions bind the attempt to the authenticated user ID.
- AI conversations are queried by both conversation ID and current user ID; tool actions only propose joins/challenges and require explicit user confirmation.
- Charity treasury and fund operations check charity ownership. A treasury address is not silently replaced; registration rejects changes that would hide transaction history.
- Payout verification checks the sender treasury, destination wallet, exact amount and proposal memo against finalized chain data.
- Private evidence uses authenticated upload/access routes; the live object-storage authorization and signed-URL lifecycle were not exercised.
- Telegram identity and group membership rely on Telegram API responses, and group moderation relies on bot administrator permissions.

No destructive authorization tests were run against production. Strong source-level checks reduce risk but do not replace cross-profile and cross-organisation authorization tests in an isolated environment.

## Report G — Test coverage report

### Executed checks

| Check | Result | Scope and caveat |
|---|---|---|
| Workspace TypeScript typecheck | **Passed** (earlier audit phase) | Static checking only. |
| API unit tests | **Passed: 32 files, 142 tests** (earlier audit phase) | Excluded `*.integration.test.mjs` to avoid writes against the configured Supabase target. |
| API auth-routing | **Passed: 2/2** | Verifies public auth validators are reachable and private evidence remains protected. |
| Mobile email/Telegram auth | **Passed: 6/6** on latest run | Browser flow intercepted/mocked API responses. A prior run timed out; latest run passed, so no product defect is inferred from the earlier failure. |
| Mobile organisation host interactions | **Passed: 5/5** | Includes host management, community setup UI and charity treasury/campaign UI with mocked API responses. |
| Mobile onboarding copy | **Passed: 2/2** | Copy/content checks, not service flow. |
| Mobile Solana payment helpers | **Passed: 4/4** | Address/URI/input validation only; no transaction sent. |
| Mobile campaign formatting/list helpers | **Passed: 7/7** | Includes amount formatting and filtering/sorting behavior. |
| Mobile location resolution | **Passed: 3/3** | Helper tests; not live Maps/Places. |
| Mobile Memory Game answer review | **Passed: 2/2** | Pure review logic only. |
| Mobile home priority | **Passed: 9/9** | Pure selection/priority logic only. |
| Mobile Home prompt / personal Activity interaction | **Passed: 1/1 on each of two runs** | The test waits for the Posts empty state after its query settles and retains the visible empty-state assertion. |
| Mobile keyboard interactions | **Profile-edit subtest failed on repeated runs; six other cases passed** | The corrected `User` fixture lets the profile flow render. The touch-scroll check consistently finds focus on `profile-menu-toggle` instead of `profile-edit-name`. This is a remaining Chromium preview behavior finding; physical-device behavior was not tested. |
| Mobile Explore interaction | **Passed: 1/1 on each of two runs; 1 live Maps test skipped** | The expected saved-experiences endpoint is fixture-backed. Unknown API requests remain rejected. Live Maps was not enabled. |
| API build / local service | **Passed** | Development workflow built and listened; not a production deployment check. |

### Coverage gaps

- No database integration suites were run; they may write to the configured Supabase database.
- No complete participant, organisation-verification, two-user social/accountability, evidence-storage, fundraising, payout or Telegram group journey was run against an isolated backend with durable test data.
- No real financial transaction, Telegram message/moderation action, or production migration was performed.
- Existing API tests are weighted toward pure rule/helper logic; route authorization, transaction boundaries, retry/race behavior and external failure handling need staging-level coverage.
- The current browser interaction suite needs fixture and wait-condition maintenance before it can be used as a reliable release gate.

## Report H — MVP completion scorecard

Percentages are intentionally omitted because the available evidence does not support a defensible numerical completion measure. “Implementation” reflects code presence; “runtime confidence” reflects what was actually exercised.

| Area | Implementation maturity | Runtime confidence | Basis |
|---|---|---|---|
| Authentication | Strongly implemented | Moderate for mocked UI; low for real persistence | Email/Telegram flows and profile-bound sessions exist; auth UI tests passed using mocks. |
| Participant onboarding | Implemented | Low | Multi-step UI and backend profile routes exist; signup persistence not exercised. |
| Organisation onboarding | Implemented | Low | Supported types and copy tests exist; no live verification approval flow. |
| Experience management | Strongly implemented | Moderate for mocked host UI; low for DB | Host UI tests passed; no target DB persistence proof. |
| Participation | Implemented | Low | Join/waitlist/leave and status routes exist; real multi-user flow not run. |
| Contribution verification | Implemented | Low | Evidence, host review and XP routes exist; no end-to-end durable flow. |
| XP and reputation | Strongly implemented | Low | Award ledger and unit rules exist; actual balance/redeem atomicity unverified. |
| Social infrastructure | Implemented | Low | Feed, friendships, DM and notifications have UI/API/schema; delivery unverified. |
| Accountability | Implemented | Low | UI/routes and rules exist; goal migration/runtime state unverified. |
| Organisation collaboration | Implemented | Low | API/UI present; invitation and acceptance flow not run. |
| Fundraising | Strongly implemented | Low for live chain; moderate for mocked UI/helpers | Non-custodial intent/verification/ledger paths and campaign UI exist; no chain transaction. |
| Treasury | Implemented | Low | Owner checks and RPC/ledger paths exist; no live RPC verification. |
| Telegram management | Implemented with external dependencies | Low | Bot, membership verification and rules exist; permissions and live group behavior unverified. |
| AI functionality | Implemented with external dependency | Low | Tool-based recommendations and conversation persistence exist; provider not exercised. |
| Analytics | Partial | Low | Activity and summaries exist; range filtering is explicitly unavailable in one screen. |
| Security | Mixed; important path flaw found | Low-to-moderate | Auth/ownership controls observed; static path guard issue and dependency findings require action. |
| Reliability | Partial | Low | The Home Posts race and Explore mock mismatch are repaired; the profile keyboard fixture is contract-complete, but its repeated focus-loss finding and production runtime readiness remain unverified. |

## Report I — Prioritised development roadmap

These are recommendations, not commitments. Follow-up test-harness changes repaired the Home Posts wait and Explore saved-experiences mock; the keyboard fixture now matches the `User` contract but exposed the separate profile focus finding documented above. No application behavior or security remediation was applied in this follow-up. Priorities follow the requested P0–P4 scale; complexity is an estimate.

### 1. Critical fixes

| Recommendation | Problem / why / affected users | Relevant files and dependencies | Priority / complexity | Acceptance criteria |
|---|---|---|---|---|
| Enforce a true static-root boundary | The current prefix check can accept paths outside the web bundle. If a useful sibling file exists in deployment, a request may expose it. Affects every visitor and potentially deployment data. | `artifacts/mobile/server/serve.js`; confirm actual deploy bundle layout. | **P0 — Small/Medium** | A path-resolved sibling whose name begins with the static-root name is rejected; traversal and encoded-path cases are covered; valid assets and SPA fallback still work; no file outside the canonical static root is served. |
| Triage and patch high-severity dependencies | The scanner reported 12 high dependency findings, including packages in build/runtime paths. A vulnerable resolved dependency may affect the shipped app or its build pipeline. | `pnpm-lock.yaml`, affected workspace package manifests; scan output. | **P1 — Medium/Large** | Every high finding is patched or has a documented, time-bounded risk acceptance; lockfile resolves the intended versions; API/mobile tests, typecheck and builds pass; deployment uses the verified lockfile. |

### 2. Launch blockers

| Recommendation | Problem / why / affected users | Relevant files and dependencies | Priority / complexity | Acceptance criteria |
|---|---|---|---|---|
| Confirm production schema readiness without changing data | The repository has 27 migrations, but production state was not queried. Features can return unavailable responses if required tables/columns are absent. Affects participants, organisations and charities. | `lib/db/migrations/`; `funds.ts:357-366`; accountability routes; designated Supabase target. | **P1 — Medium** | An authorized read-only schema check confirms required migrations/tables/constraints in the intended database; missing migrations are reported by name; no DDL or application writes occur during the check. |
| Run controlled critical journeys in isolated staging | Code and mocked UI tests do not establish real API, DB, storage, Telegram or RPC behavior. | Mobile/API routes, generated client, database migrations, storage, Telegram and Solana test configuration. | **P1 — Large** | Test accounts complete signup/profile; host creates and publishes an experience; participant joins, submits evidence and receives host review/XP; charity campaign records a finalized test-cluster payment; each step survives reload; failures and unauthorized cross-profile requests are covered; production data and mainnet funds are untouched. |
| Verify client-visible Maps key restrictions | The configured Maps key is necessarily used in a browser; its API/referrer restrictions were not checked. | Root `.replit` configuration and Google Cloud Maps/Places restrictions. | **P1 — Small** | Only required APIs and approved origins can use the key; a valid preview map/Places query succeeds; unapproved-origin/API use is rejected; no key value is placed in the audit or logs. |

### 3. Core journey completion

| Recommendation | Problem / why / affected users | Relevant files and dependencies | Priority / complexity | Acceptance criteria |
|---|---|---|---|---|
| Make the mobile interaction tests stable release checks | The Home Posts race and Explore mock mismatch caused false failures and are repaired. The keyboard fixture now conforms to `User`, but the profile edit retains a separate focus-loss failure during simulated mobile scrolling. | `artifacts/mobile/scripts/home-prompt-interaction.test.mjs`; `keyboard-interaction.test.mjs`; `explore-globe-interaction.test.mjs`; `ProfilePosts.tsx`; `app/index.tsx`. | **P2 — Medium; partial** | Home and Explore pass repeatedly; the profile fixture remains contract-complete; no user-visible assertion is weakened. Confirm the profile focus result on an actual device and track/fix any confirmed behavior defect before treating the entire suite as green. |
| Verify host review, evidence access and XP as one user journey | Components and isolated rules exist, but the complete participant-to-host-to-XP loop has not been exercised with persisted data. | `experiences.ts`; `private-evidence.ts`; XP award routes; mobile host and participant screens; migrations 0016-0018 and award schema. | **P1 — Large** | A participant submits private evidence; only authorized host/reviewer can access it; approval/rejection and resubmission states are correct; one qualifying approval yields one award; participant history and balance agree after reload. |
| Verify organisation invitation acceptance and cross-organisation attribution | Collaboration is a product journey with multiple owners and status transitions; the audit did not confirm both sides see consistent records. | `artifacts/api-server/src/routes/organisation-partnerships.ts`; `OrganisationPartnershipsSection.tsx`; schema/migrations. | **P2 — Medium** | A different organisation can accept an invite; unauthorized users cannot; both dashboards show the same active partnership; creator attribution is preserved; duplicate/concurrent requests return a defined conflict. |

### 4. Technical improvements

| Recommendation | Problem / why / affected users | Relevant files and dependencies | Priority / complexity | Acceptance criteria |
|---|---|---|---|---|
| Use shared throttling for multi-instance API deployments | Payment and assistant throttles are process-local. Under multiple replicas, the aggregate limit can be bypassed across instances and resets on restart. | `ai-assistant.ts:26-64`; `fund-contributions.ts:20-27`; `fund-payouts.ts:18-19`; deployment topology. | **P2 — Medium** | Limits are keyed by authenticated profile/resource in a shared store; limits work across replicas; expected legitimate retries remain possible; store outage behavior is explicit and tested. |
| Add route-level authorization and transaction tests | Helper tests do not prove route ownership, DB locks, unique-index handling, or retry behavior. | Funds, participation, XP, Memory Game, feed and accountability route modules; isolated test database. | **P2 — Large** | Each sensitive route has unauthorized-owner tests, duplicate/concurrent request tests and failure rollback tests; tests use disposable local/staging data only. |

### 5. UX improvements

| Recommendation | Problem / why / affected users | Relevant files and dependencies | Priority / complexity | Acceptance criteria |
|---|---|---|---|---|
| Clarify moderation scope and bot permission requirements | Dashboard controls depend on Telegram admin permissions; saved review inbox is not available. Managers may expect review/restore controls that do not exist. | `TelegramCommunityManagementScreen.tsx:474`; `community.ts`; `lib/telegram.ts`. | **P2 — Medium** | Setup explains required bot/admin permissions before activation; successful and insufficient-permission states are distinct; UI accurately states that matching messages are automatically removed and no review inbox exists. |
| Make unsupported community sharing unambiguous | The API rejects community visibility. If a client presents that choice, submission fails despite being selectable. | `feed.ts:659-668`; OpenAPI feed visibility and `SocialFeed.tsx`. | **P2 — Small/Medium** | Client choices match accepted server values; unsupported visibility cannot be submitted; supported posts show a clear success/error state. |
| Add analytics time filters only if required by launch goals | One organisation metric screen says time-range filters are unavailable. This is a limitation, not a core participation blocker. | `OrganisationFundsScreen.tsx:1903`; analytics API/schema. | **P3 — Medium** | If approved for scope, date ranges have defined timezones and totals reconcile to the same source records; otherwise the all-time limitation remains explicit. |

### 6. Post-MVP development

- Saved Telegram moderation review inbox and message restoration, if community managers need manual review rather than automatic removal.
- Community-scoped feed visibility after its membership and moderation semantics are defined end to end.
- Additional analytics and reporting beyond the current evidence-backed activity summaries.
- Expanded AI assistant actions only after provider availability, user confirmation, and failure recovery are validated.

## Audit completion statement

Reports A–I are complete for the inspected source and safe checks. This is an evidence-based **code and test audit**, not a certification of production runtime, live data, or financial operation. Findings and roadmap items are provided for review; no fixes or migrations have been applied.
