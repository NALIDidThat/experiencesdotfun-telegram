import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeBase58, decodeBase58, solToLamports, createPaymentReference,
  extractSolTransfers, matchesPayment, paymentUri, readFinalizedTransfers, publicPaymentError, SolanaRpcError,
} from "./fund-payments.mjs";
import { isValidSolanaAddress } from "./solana-rpc.mjs";

const sender = encodeBase58(Buffer.alloc(32, 1));
const destination = encodeBase58(Buffer.alloc(32, 2));
const reference = encodeBase58(Buffer.alloc(32, 3));
const system = "11111111111111111111111111111111";
const memoProgram = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const signature = encodeBase58(Buffer.alloc(64, 9));
function fixture({ amount = 123456789n, memo = "Experiences.fun fund 7" } = {}) {
  const data = Buffer.alloc(12);
  data.writeUInt32LE(2);
  data.writeBigUInt64LE(amount, 4);
  return {
    blockTime: 1780000000,
    meta: { err: null, innerInstructions: [], loadedAddresses: { writable: [], readonly: [] } },
    transaction: {
      signatures: [signature],
      message: {
        header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 3 },
        accountKeys: [sender, destination, reference, system, memoProgram],
        instructions: [
          { programIdIndex: 4, accounts: [], data: encodeBase58(Buffer.from(memo)) },
          { programIdIndex: 3, accounts: [0, 1, 2], data: encodeBase58(data) },
        ],
      },
    },
  };
}

test("SOL amounts use exact integer lamports, including the smallest donation", () => {
  assert.equal(solToLamports("0.000000001"), "1");
  assert.equal(solToLamports("1.123456789"), "1123456789");
  assert.equal(solToLamports("1000000000"), "1000000000000000000");
  for (const invalid of ["0", "-1", "1e-9", "NaN", "Infinity", "01", ".1", "1.", "1.0000000001", "1000000000.000000001", "", " 1"]) {
    assert.throws(() => solToLamports(invalid), invalid);
  }
});

test("references are random valid 32-byte public identifiers; no private keys exist", () => {
  const references = Array.from({ length: 50 }, createPaymentReference);
  assert.equal(new Set(references).size, 50);
  for (const value of references) assert.ok(isValidSolanaAddress(value));
  for (const bytes of [Buffer.alloc(32), Buffer.from([0, 0, 1]), Buffer.alloc(32, 255)]) {
    assert.deepEqual(decodeBase58(encodeBase58(bytes)), bytes);
  }
});

test("payment URL contains exact amount, unique reference and public campaign memo", () => {
  const uri = new URL(paymentUri({ walletAddress: destination, amountSol: "0.000000001", reference, fundId: 7, organisationName: "Local charity", cluster: "devnet" }));
  assert.equal(uri.protocol, "solana:");
  assert.equal(uri.searchParams.get("reference"), reference);
  assert.equal(uri.searchParams.get("amount"), "0.000000001");
  assert.equal(uri.searchParams.get("memo"), "Experiences.fun fund 7");
  assert.equal(uri.searchParams.get("cluster"), "devnet");
  assert.equal(new URL(paymentUri({ walletAddress: destination, amountSol: "1", reference, fundId: 7, organisationName: "Local charity", cluster: "mainnet-beta" })).searchParams.has("cluster"), false);
});

test("raw System Program transfer retains reference and exact lamports", () => {
  const transfers = extractSolTransfers(fixture());
  assert.equal(transfers.length, 1);
  assert.deepEqual(transfers[0], {
    instructionIndex: "1", sender, destination, amountLamports: "123456789", campaignId: 7,
    memo: "Experiences.fun fund 7", references: [reference], blockTime: "2026-05-28T20:26:40.000Z",
  });
});

test("unsafe JS integer amounts are decoded precisely from wire bytes", () => {
  assert.equal(extractSolTransfers(fixture({ amount: 999999999999999999n }))[0].amountLamports, "999999999999999999");
});

test("failed, missing, zero and self-transfers never credit a contribution", () => {
  const failed = fixture(); failed.meta.err = { InstructionError: [0, "failure"] };
  assert.deepEqual(extractSolTransfers(failed), []);
  assert.deepEqual(extractSolTransfers(null), []);
  assert.deepEqual(extractSolTransfers(fixture({ amount: 0n })), []);
  const self = fixture(); self.transaction.message.accountKeys[1] = sender;
  assert.deepEqual(extractSolTransfers(self), []);
});

test("memo attribution is instruction-specific and only adjacent memo is used", () => {
  const transaction = fixture();
  transaction.transaction.message.instructions.push({ ...transaction.transaction.message.instructions[1] });
  const transfers = extractSolTransfers(transaction);
  assert.equal(transfers[0].campaignId, 7);
  assert.equal(transfers[1].campaignId, null);
  for (const memo of ["Experiences.fun fund 07", "Experiences.fun fund 9007199254740993", "something private", "Experiences.fun fund -1"]) {
    assert.equal(extractSolTransfers(fixture({ memo }))[0].campaignId, null);
  }
});

test("foreign programs and malformed data cannot impersonate SOL payments", () => {
  const foreign = fixture(); foreign.transaction.message.accountKeys[3] = reference;
  assert.deepEqual(extractSolTransfers(foreign), []);
  const invalid = fixture(); invalid.transaction.message.instructions[1].data = "not-base58-0";
  assert.deepEqual(extractSolTransfers(invalid), []);
});

test("references must be read-only non-signers on the actual transfer, not elsewhere in a transaction", () => {
  const writable = fixture(); writable.transaction.message.header.numReadonlyUnsignedAccounts = 2;
  assert.deepEqual(extractSolTransfers(writable)[0].references, []);
  const missing = fixture(); missing.transaction.message.instructions[1].accounts.pop();
  const transfer = extractSolTransfers(missing)[0];
  assert.equal(matchesPayment(transfer, { walletAddress: destination, amountLamports: "123456789", reference }), false);
});

test("reference matching requires exact destination and amount; campaign memo alone is insufficient", () => {
  const [transfer] = extractSolTransfers(fixture());
  const intent = { walletAddress: destination, amountLamports: "123456789", reference };
  assert.ok(matchesPayment(transfer, intent));
  for (const changed of [{ walletAddress: sender }, { amountLamports: "123456788" }, { reference: sender }]) {
    assert.equal(matchesPayment(transfer, { ...intent, ...changed }), false);
  }
});

test("v0 address table read-only references are resolved", () => {
  const transaction = fixture();
  transaction.transaction.message.accountKeys.splice(2, 1);
  transaction.transaction.message.header.numReadonlyUnsignedAccounts = 2;
  transaction.meta.loadedAddresses.readonly.push(reference);
  transaction.transaction.message.instructions[0].programIdIndex = 3;
  transaction.transaction.message.instructions[1].programIdIndex = 2;
  transaction.transaction.message.instructions[1].accounts = [0, 1, 4];
  assert.deepEqual(extractSolTransfers(transaction)[0].references, [reference]);
});

test("CPI multisig payout transfers preserve proposal memo and stable instruction identity", () => {
  const transaction = fixture({ memo: "Experiences.fun payout 530b031a-fb99-4e19-9ca6-7d90b0e46113" });
  transaction.meta.innerInstructions = [{ index: 0, instructions: transaction.transaction.message.instructions }];
  transaction.transaction.message.instructions = [];
  const [transfer] = extractSolTransfers(transaction);
  assert.equal(transfer.instructionIndex, "0.1");
  assert.equal(transfer.memo, "Experiences.fun payout 530b031a-fb99-4e19-9ca6-7d90b0e46113");
  assert.equal(transfer.sender, sender);
});

test("RPC verification always requests finalized raw transactions on the selected cluster", async () => {
  const transfers = await readFinalizedTransfers("devnet", signature, async (url, options) => {
    assert.equal(url, "https://api.devnet.solana.com");
    const body = JSON.parse(options.body);
    assert.equal(body.method, "getTransaction");
    assert.deepEqual(body.params, [signature, { commitment: "finalized", encoding: "json", maxSupportedTransactionVersion: 0 }]);
    return { ok: true, json: async () => ({ result: fixture() }) };
  });
  assert.equal(transfers.length, 1);
});

test("RPC outages, missing finalization, signature mismatch and errors fail explicitly", async () => {
  for (const result of [null, { meta: {} }, { ...fixture(), transaction: { ...fixture().transaction, signatures: ["different"] } }]) {
    await assert.rejects(readFinalizedTransfers("devnet", signature, async () => ({ ok: true, json: async () => ({ result }) })));
  }
  await assert.rejects(readFinalizedTransfers("invalid", signature));
  await assert.rejects(readFinalizedTransfers("devnet", signature, async () => ({ ok: false, status: 429 })), /429/);
  await assert.rejects(readFinalizedTransfers("devnet", signature, async () => ({ ok: true, json: async () => ({ error: { message: "unavailable" } }) })), /retry/);
});

test("verification errors never expose SQL, profile identifiers or database parameters", () => {
  assert.match(publicPaymentError({ cause: { code: "42P01" } }), /migration/);
  assert.match(publicPaymentError(new Error("Failed query SQL secret parameters")), /retry/);
  assert.doesNotMatch(publicPaymentError(new Error("Failed query SQL secret parameters")), /SQL|secret|parameters/);
  assert.equal(publicPaymentError(new SolanaRpcError("Solana RPC returned HTTP 429. Please retry.")), "Solana RPC returned HTTP 429. Please retry.");
});
