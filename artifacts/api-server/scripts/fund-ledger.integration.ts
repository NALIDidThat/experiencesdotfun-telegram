import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import express from "express";
import { db, pool, usersTable, organisationsTable, telegramSessionsTable } from "@workspace/db";
import fundsRouter from "../src/routes/funds";
import { encodeBase58 } from "../src/lib/fund-payments.mjs";

// This script is bundled and launched by the isolated-database harness.
// Authentication is the real profile-bound Telegram session middleware;
// only Solana RPC responses and logging are replaced.
const tokens = [0, 1, 2, 3, 4, 5].map((id) => `telegram_fundraising_test_${id}`);
const addresses = [1, 2, 3, 4, 5, 6].map((byte) => encodeBase58(Buffer.alloc(32, byte)));
const signatures = [8, 9, 10, 11].map((byte) => encodeBase58(Buffer.alloc(64, byte)));
const rpcTransactions = new Map<string, unknown>();
const rpcHistories = new Map<string, Array<{ signature: string; err: unknown }>>();
const nativeFetch = globalThis.fetch;
let now = Date.now();
Date.now = () => now;
globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
  if (typeof url !== "string" || !url.startsWith("https://api.devnet.solana.com")) throw new Error("Unexpected external network call in fundraising test.");
  const body = JSON.parse(String(options?.body));
  const result = body.method === "getSignaturesForAddress" ? rpcHistories.get(body.params[0]) ?? []
    : body.method === "getTransaction" ? rpcTransactions.get(body.params[0]) ?? null
    : body.method === "getBalance" ? { value: 2_000_000_000 } : undefined;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
}) as typeof fetch;

function transaction(signature: string, source: string, destination: string, amount: bigint, reference?: string, memo = "Experiences.fun fund 1", cpi = false) {
  const keys = [source, destination, ...(reference ? [reference] : []), "11111111111111111111111111111111", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"];
  const data = Buffer.alloc(12); data.writeUInt32LE(2); data.writeBigUInt64LE(amount, 4);
  const instructions = [
    { programIdIndex: keys.length - 1, accounts: [], data: encodeBase58(Buffer.from(memo)) },
    { programIdIndex: keys.length - 2, accounts: [0, 1, ...(reference ? [2] : [])], data: encodeBase58(data) },
  ];
  return {
    blockTime: Math.floor(now / 1000),
    meta: { err: null, loadedAddresses: { writable: [], readonly: [] }, innerInstructions: cpi ? [{ index: 0, instructions }] : [] },
    transaction: { signatures: [signature], message: {
      header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: keys.length - 2 },
      accountKeys: keys, instructions: cpi ? [] : instructions,
    } },
  };
}
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as express.Request & { log?: { warn(fields: Record<string, unknown>, message: string): void } }).log = {
    warn(fields, message) {
      console.error(message, fields.code, fields.message);
    },
  };
  next();
});
app.use("/api/funds", fundsRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ message: "Test request failed." });
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as { port: number }).port;
let checks = 0;
async function request(path: string, { user = 2, method = "GET", body, expected = 200 }: { user?: number; method?: string; body?: unknown; expected?: number } = {}) {
  now += 4000; // advance the RPC rate limiter, not database or blockchain time
  const response = await nativeFetch(`http://127.0.0.1:${port}/api/funds${path}`, {
    method, headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${tokens[user]}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
try {
  await db.insert(usersTable).values([
    { id: 1, telegramId: "charity-test", name: "Test Charity", userType: "organisation" },
    { id: 2, telegramId: "same-login", name: "Test Donor", userType: "participant" },
    { id: 3, telegramId: "other-charity-test", name: "Other Charity", userType: "organisation" },
    { id: 4, telegramId: "volunteer-test", name: "Test Volunteer", userType: "participant" },
    { id: 5, telegramId: "same-login", name: "Alternate Profile", userType: "organisation" },
  ]);
  await db.insert(organisationsTable).values([
    { id: 1, ownerUserId: 1, name: "Test Charity", organisationType: "charity" },
    { id: 2, ownerUserId: 3, name: "Other Charity", organisationType: "charity" },
  ]);
  await db.insert(telegramSessionsTable).values(tokens.slice(1).map((token, i) => ({
    userId: i + 1, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86400000),
  })));
  await pool.query("INSERT INTO experiences (id, organisation_id) VALUES (1,1); INSERT INTO participations (experience_id,user_id) VALUES (1,4)");
  await request("/treasury", { user: 1, method: "PUT", body: { walletAddress: addresses[0], cluster: "devnet" } });
  await request("/", { user: 1, method: "POST", body: { title: "Community garden", description: "Supplies for local volunteers", goalSol: 2 }, expected: 201 });
  await request("/contributions", { user: 0, expected: 401 });
  await request("/ledger", { user: 2, expected: 403 });
  await request("/payout-candidates", { user: 2, expected: 403 });
  assert.equal((await request("/payout-candidates", { user: 1 }))[0].id, 4);
  await request("/campaigns/1/contributions", { method: "POST", body: { amountSol: "0.0000000001" }, expected: 400 });
  const creates = await Promise.all(Array.from({ length: 4 }, () => request("/campaigns/1/contributions", { method: "POST", body: { amountSol: "0.1" }, expected: 201 })));
  assert.equal(new Set(creates.map((row) => row.id)).size, 1, "simultaneous duplicate requests must resume one intent");
  const intent = creates[0];
  assert.ok(new URL(intent.paymentUri).searchParams.has("reference"));
  assert.equal(intent.status, "pending");
  assert.equal((await request("/contributions", { user: 5 })).length, 0, "same login does not merge profile ledgers");
  await request(`/contributions/${intent.id}/verify`, { user: 5, method: "POST", expected: 404 });
  await request(`/contributions/${intent.id}/cancel`, { user: 5, method: "POST", expected: 404 });
  const pending = await request(`/contributions/${intent.id}/verify`, { method: "POST" });
  assert.equal(pending.status, "pending");
  assert.equal((await request("/1"))[0].raisedSol, "0.000000000");
  rpcTransactions.set(signatures[0], transaction(signatures[0], addresses[1], addresses[0], 100000000n, intent.reference));
  rpcHistories.set(intent.reference, [{ signature: signatures[0], err: null }]);
  const paid = await request(`/contributions/${intent.id}/verify`, { method: "POST" });
  assert.equal(paid.status, "confirmed");
  assert.equal(paid.signature, signatures[0]);
  await request(`/contributions/${intent.id}/verify`, { method: "POST" });
  await request(`/contributions/${intent.id}/cancel`, { method: "POST" });
  assert.equal((await request("/contributions"))[0].status, "confirmed");
  assert.equal((await request("/1"))[0].raisedSol, "0.100000000");
  // A second unrelated transfer must not be assigned to a donor or to a foreign campaign.
  rpcTransactions.set(signatures[1], transaction(signatures[1], addresses[2], addresses[0], 50000000n, undefined, "Experiences.fun fund 999"));
  rpcHistories.set(addresses[0], [{ signature: signatures[1], err: null }, { signature: signatures[0], err: null }]);
  await request("/ledger/sync", { user: 1, method: "POST", body: {} });
  await request("/ledger/sync", { user: 1, method: "POST", body: {} });
  const ledger = await request("/ledger", { user: 1 });
  assert.equal(ledger.entries.length, 2);
  assert.equal(ledger.totalSol, "0.150000000");
  assert.equal(ledger.unattributedSol, "0.050000000");
  assert.ok(ledger.entries.some((entry: { attribution: string }) => entry.attribution === "unattributed"));
  assert.equal(ledger.historyComplete, true);
  await request("/ledger?before=not-a-number", { user: 1, expected: 400 });
  await request("/contributions?before=not-a-uuid", { expected: 400 });
  await request("/campaigns/1", { user: 3, method: "PATCH", body: { status: "closed" }, expected: 404 });
  const late = await request("/campaigns/1/contributions", { method: "POST", body: { amountSol: "0.2" }, expected: 201 });
  await request(`/contributions/${late.id}/cancel`, { method: "POST" });
  await request("/campaigns/1", { user: 1, method: "PATCH", body: { status: "closed", title: "Garden supplies" } });
  await request("/campaigns/1/contributions", { method: "POST", body: { amountSol: "0.3" }, expected: 409 });
  rpcTransactions.set(signatures[2], transaction(signatures[2], addresses[1], addresses[0], 200000000n, late.reference));
  rpcHistories.set(late.reference, [{ signature: signatures[2], err: null }]);
  assert.equal((await request(`/contributions/${late.id}/verify`, { method: "POST" })).status, "confirmed", "closed/cancelled request can still receive late payment");
  assert.equal((await request("/1"))[0].raisedSol, "0.300000000");
  const allTimeActivity = await request("/campaigns/1/activity/all", { user: 0 });
  assert.equal(allTimeActivity.supporterWalletCount, 1, "the public campaign tracker counts distinct wallets, not profiles");
  assert.deepEqual(allTimeActivity.topSupporters[0], { rank: 1, amountSol: "0.300000000", contributionCount: 2 });
  assert.equal(allTimeActivity.recentContributions.length, 2);
  assert.ok(allTimeActivity.recentContributions.every((entry: Record<string, unknown>) => !("sender" in entry) && !("signature" in entry)));
  const monthlyActivity = await request("/campaigns/1/activity/month", { user: 0 });
  assert.equal(monthlyActivity.topSupporters[0].amountSol, "0.300000000", "the monthly filter ranks only deposits confirmed this month");
  assert.equal(monthlyActivity.supporterWalletCount, 1);
  await request("/campaigns/1/activity/year", { user: 0, expected: 400 });
  await request("/campaigns/999/activity/all", { user: 0, expected: 404 });
  await request("/campaigns/1", { user: 1, method: "PATCH", body: { status: "active" } });
  const payoutInput = { recipientUserId: 4, walletAddress: addresses[3], amountSol: "0.05", reason: "Garden volunteering expenses", fundId: 1 };
  await request("/payouts", { user: 2, method: "POST", body: payoutInput, expected: 403 });
  await request("/payouts", { user: 1, method: "POST", body: { ...payoutInput, walletAddress: "invalid" }, expected: 400 });
  const proposal = await request("/payouts", { user: 1, method: "POST", body: payoutInput, expected: 201 });
  const duplicate = await request("/payouts", { user: 1, method: "POST", body: payoutInput, expected: 201 });
  assert.equal(proposal.id, duplicate.id);
  assert.equal(proposal.status, "proposed");
  assert.equal((await request("/payouts", { user: 4 }))[0].id, proposal.id);
  assert.equal((await request("/payouts", { user: 2 })).length, 0);
  await request(`/payouts/${proposal.id}/cancel`, { user: 4, method: "POST", expected: 404 });
  await request(`/payouts/${proposal.id}/verify`, { user: 2, method: "POST", body: { signature: signatures[0] }, expected: 404 });
  const wrong = await request(`/payouts/${proposal.id}/verify`, { user: 1, method: "POST", body: { signature: signatures[0] } });
  assert.equal(wrong.status, "proposed");
  await request(`/payouts/${proposal.id}/cancel`, { user: 1, method: "POST" });
  rpcTransactions.set(signatures[3], transaction(signatures[3], addresses[0], addresses[3], 50000000n, undefined, proposal.memo, true));
  const payout = await request(`/payouts/${proposal.id}/verify`, { user: 4, method: "POST", body: { signature: signatures[3] } });
  assert.equal(payout.status, "paid", "recipient can verify the exact executed CPI transfer, even if proposal was dismissed");
  assert.equal((await request("/payouts", { user: 1 }))[0].signature, signatures[3]);
  await request(`/payouts/${proposal.id}/verify`, { user: 1, method: "POST", body: { signature: signatures[3] } });
  const protectedTables = await pool.query("SELECT relname FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relrowsecurity");
  assert.equal(protectedTables.rows.length, 3, "financial tables must have RLS enabled");
  console.log(`Fundraising integration passed: ${checks} authenticated API requests plus exact ledger, concurrency, privacy, late-payment and payout assertions.`);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
}
