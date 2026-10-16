# Fundraising and financial records

## Activation

The application uses its existing Supabase PostgreSQL database. The additive
`lib/db/migrations/0019_fund_contribution_ledger.sql` migration adds payment requests,
finalized deposits, payout proposals and treasury sync metadata. It preserves
existing rows. New financial tables have row-level security enabled without
client-facing policies; access is through the authenticated backend.

Do not run broad schema pushes or run this migration on app startup. After the
user explicitly approves the configured **Production — Experiences Dot Fun**
Supabase target, run:

```sh
pnpm --filter @workspace/db run migrate:fundraising --approve-production-experiences-dot-fun
```

The runner uses a transaction and checks that existing user, organisation, fund
and treasury row counts are unchanged. Until applied, ledger endpoints return an
actionable 503 rather than pretending payment requests were saved.

## Donor journey

Open a charity's campaign, choose SOL and create a contribution request. The server
persists the selected profile, campaign, exact lamports and a random Solana Pay
reference **before** handing off to a wallet. Requests are resumable in Profile →
My contributions. Donations are native SOL; there is no fiat or SPL-token flow.

Confirm the network and destination in the wallet. Devnet/testnet links carry a
nonstandard `cluster` hint some wallets ignore: switch the wallet explicitly.
Opening or sharing a link is not payment. Return and select **Verify payment**.
Only a finalized successful System Program transfer to the registered treasury,
with the request's exact amount and read-only reference on that instruction,
produces a receipt. The source is shown as an address, not proof the profile owns
that wallet. A shared request may be paid by another person.

Dismissal does not reverse or cancel a wallet transaction. Requests can still be
verified after dismissal or campaign closure. Duplicate verification/imports do
not duplicate money or campaign totals. If a wallet omits the reference or sends
a different amount, the incoming funds can appear in the charity's ledger, but
are not falsely credited to the profile's request.

## Charity journey

The Treasury screen displays live finalized balance separately from the durable
incoming-transfer ledger. **Sync recent page** imports the latest 20 transaction
signatures. **Import older history** continues from the saved chain cursor.
Recorded entries are paginated independently. Sync retries are safe; a failure
does not advance the history cursor. Syncing recent history restarts the contiguous
backfill so bursts of new transfers cannot leave a hidden gap.

Coverage is only the history available from the selected RPC provider, not a
guarantee the provider retains every historical transaction. Public Solana RPCs
can rate-limit; retry and complete the backfill. Totals never infer fundraising
progress from a live balance, which may include payouts and unrelated deposits.

Each incoming instruction is classified separately:

- **Reference:** verified exact payment request. This binds a request, not wallet ownership.
- **Memo:** finalized incoming SOL with an adjacent matching campaign memo belonging
  to this treasury's charity. This is a campaign attribution hint only.
- **Unattributed:** finalized incoming SOL without either match. Visible regardless
  of sender; no profile is invented.

Campaign progress sums recorded attributed incoming transfers, including memo-only
attribution. Editing title/description or closing/reopening a campaign preserves
its ledger. Goals are not treasury balance or spend limits.

## Volunteer payouts and custody

Charities choose a participant, recipient wallet, amount and reason, optionally
allocating the proposal to an owned campaign. Volunteer suggestions are scoped to
the charity's experiences. A proposal is **not** a fund reservation, on-chain
approval or payment. Confirm the recipient's wallet independently; the app does
not prove that profile controls it.

Share the exact proposal memo, treasury, destination, amount and network with the
charity's multisig signers. Signers create, approve and execute the transfer in
their own tooling (for example Squads). Include the exact proposal memo immediately
before its SOL transfer. CPI/inner transfers are supported.

Paste the executed signature to verify. The server requires a finalized transfer
from the registered treasury to the exact recipient for the exact amount and
adjacent proposal memo. Only then is the payout shown as paid in both the charity's
records and the recipient's My contributions screen. Dismissed proposals can still
be reconciled if executed externally later.

Experiences.fun never stores wallet private keys, signs transactions or controls
the treasury. Address registration checks address validity/network readability,
**not** Squads ownership, signer membership or multisig approval state. External
multisig creation and approval are intentionally outside the application.

## Verification

```sh
DATABASE_BACKEND=none pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run test:fundraising
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/mobile run typecheck
```

The integration harness creates a disposable schema in the built-in development
database, applies the actual fundraising migrations, uses real profile-bound auth
and routes, and mocks only Solana RPC/logging. It never targets Supabase or changes
the application's backend. It cleans up its own schema in `finally`. Browser tests
with intercepted responses do not replace a real devnet wallet transfer check.

Protocol references: [Solana Pay specification](https://docs.solanapay.com/spec),
[getTransaction](https://solana.com/docs/rpc/http/gettransaction),
[getSignaturesForAddress](https://solana.com/docs/rpc/http/getsignaturesforaddress).
