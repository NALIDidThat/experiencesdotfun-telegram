import assert from "node:assert/strict";
import { test } from "node:test";
import { getSolanaBalance, getSolanaTreasuryActivity, isValidSolanaAddress, lamportsToSol } from "./solana-rpc.mjs";

const address = "11111111111111111111111111111111";

test("validates Solana public keys and formats lamports without floating point loss", () => {
  assert.equal(isValidSolanaAddress(address), true);
  assert.equal(isValidSolanaAddress("invalid"), false);
  assert.equal(lamportsToSol("9007199254740993"), "9007199.254740993");
});

test("reads finalized balance from the selected cluster", async () => {
  let request;
  const balance = await getSolanaBalance({
    address,
    cluster: "devnet",
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ result: { value: 1234567890 } }) };
    },
  });
  assert.equal(balance, "1234567890");
  assert.equal(request.url, "https://api.devnet.solana.com");
  assert.equal(request.body.method, "getBalance");
});

test("returns only finalized incoming SOL transfers and attributes a Solana Pay campaign memo", async () => {
  const signature = "2".repeat(64);
  const failedSignature = "3".repeat(64);
  let campaignMemoAdjacent = true;
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.method === "getSignaturesForAddress") {
      return {
        ok: true,
        json: async () => ({ result: [
          { signature, err: null, blockTime: 1700000000 },
          { signature: failedSignature, err: { InstructionError: [0, "Custom"] }, blockTime: 1700000001 },
        ] }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        result: {
          meta: { err: null, innerInstructions: [] },
          transaction: { message: { instructions: [
            { program: "spl-memo", parsed: { type: "memo", info: "Experiences.fun fund 42" } },
            ...(campaignMemoAdjacent ? [] : [{ program: "compute-budget", parsed: { type: "setComputeUnitLimit", info: {} } }]),
            {
              program: "system",
              parsed: { type: "transfer", info: { source: "4".repeat(32), destination: address, lamports: 2500000000 } },
            },
          ] } },
        },
      }),
    };
  };
  const result = await getSolanaTreasuryActivity({ address, cluster: "mainnet-beta", fetchImpl });
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].status, "confirmed");
  assert.equal(result.transactions[0].amountSol, "2.500000000");
  assert.equal(result.transactions[0].sender, "4".repeat(32));
  assert.equal(result.transactions[0].campaignId, 42);
  assert.equal(result.transactions[1].status, "failed");
  assert.equal(result.transactions[1].campaignId, null);
  assert.equal(result.transactions[1].amountSol, null);

  campaignMemoAdjacent = false;
  const unlinkedMemoResult = await getSolanaTreasuryActivity({ address, cluster: "mainnet-beta", fetchImpl });
  assert.equal(unlinkedMemoResult.transactions[0].campaignId, null);
});

test("rejects invalid cluster and transaction cursors", async () => {
  await assert.rejects(() => getSolanaBalance({ address, cluster: "localnet", fetchImpl: fetch }), /cluster/);
  await assert.rejects(() => getSolanaTreasuryActivity({ address, cluster: "devnet", before: "bad", fetchImpl: fetch }), /cursor/);
});
