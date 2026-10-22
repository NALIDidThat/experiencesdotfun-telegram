# Product and contribution reliability

This note records the current reliability rules for participant and organisation
Home, lifecycle analytics, and contribution records. It describes implemented
behaviour; it does not claim that every contribution is independently verified
or that every activity is on-chain.

## Home priorities

- Participant Home uses the server's participation status and experience status
  together. It distinguishes update requests, completion submissions, upcoming
  joined experiences, waitlists, and submissions awaiting review.
- Verified history is not presented as work still requiring attention. The Home
  commitment list is capped at three entries.
- Organisation Home gives pending participant reviews priority, then the next
  hosted experience, then charity campaign actions. Query failures remain
  visible as errors rather than being reported as zero activity.
- Campaign raised totals come from confirmed campaign-linked contribution
  ledger records. They are not inferred from a treasury wallet balance.

## Contribution and analytics trust

- Joining an experience is not attendance or completion.
- Completion and milestone submissions remain pending until an authorised
  organisation action verifies or rejects them. XP awards are created in the
  server-side verification transaction, not from a client button click.
- Lifecycle analytics are recorded by the server after successful state
  changes. The client analytics endpoint accepts screen-view details but fixes
  the event name server-side. Analytics rows contain aggregate event metadata,
  not participant IDs.
- Analytics writes are awaited and failures are logged. A logging failure does
  not undo a successfully completed product action, so analytics remain
  best-effort during database outages.

## Verification

The workspace checks are:

```sh
pnpm test
pnpm run typecheck
pnpm run build
```

`pnpm run build` includes the workspace tests, typechecks, and package builds.
The mobile browser interaction suite is separate:

```sh
EXPO_WEB_PREVIEW_URL=http://127.0.0.1:19006 \
CHROMIUM_PATH=/path/to/chromium \
pnpm --filter @workspace/mobile run test:e2e
```

Start the Expo web preview on that URL first. Browser tests can also use
`REPLIT_EXPO_DEV_DOMAIN` when run against the Replit preview. The Google Maps
integration test remains opt-in because it makes live third-party requests;
the CI suite exercises the map fallback and mocked application APIs without
production credentials.
