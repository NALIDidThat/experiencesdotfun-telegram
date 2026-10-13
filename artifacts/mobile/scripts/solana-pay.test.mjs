import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDonationUri, isValidSolanaAddress, resolveSolanaCluster } from "../lib/solana-pay.mjs";

const zeroAddress = "11111111111111111111111111111111";

test("validates a 32-byte base58 Solana address", () => {
  assert.equal(isValidSolanaAddress(zeroAddress), true);
  assert.equal(isValidSolanaAddress("1111111111111111111111111111111"), false);
  assert.equal(isValidSolanaAddress("0".repeat(32)), false);
});

test("builds a donor-approved SOL transfer URI with campaign reference", () => {
  const uri = buildDonationUri({
    recipient: zeroAddress,
    amount: 0.125,
    organisationName: "Community Charity",
    fundTitle: "Garden supplies",
    fundId: 42,
    cluster: "devnet",
  });
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "solana:");
  assert.equal(parsed.pathname, zeroAddress);
  assert.equal(parsed.searchParams.get("amount"), "0.125");
  assert.equal(parsed.searchParams.get("label"), "Community Charity");
  assert.equal(parsed.searchParams.get("message"), "Garden supplies");
  assert.equal(parsed.searchParams.get("memo"), "Experiences.fun fund 42");
  assert.equal(parsed.searchParams.get("cluster"), "devnet");
});

test("rejects malformed recipients, invalid amounts, and unsupported clusters", () => {
  const base = { recipient: zeroAddress, amount: 1, organisationName: "Charity", fundTitle: "Fund", fundId: 1 };
  assert.throws(() => buildDonationUri({ ...base, recipient: "not-a-wallet" }), /recipient/);
  assert.throws(() => buildDonationUri({ ...base, amount: 0 }), /Donation amount/);
  assert.throws(() => buildDonationUri({ ...base, amount: 1.0000000001 }), /Donation amount/);
  assert.throws(() => buildDonationUri({ ...base, cluster: "localnet" }), /cluster/);
});

test("defaults donation requests to devnet in development and mainnet in production", () => {
  assert.equal(resolveSolanaCluster(undefined, true), "devnet");
  assert.equal(resolveSolanaCluster(undefined, false), "mainnet-beta");
  assert.throws(() => resolveSolanaCluster("localnet", true), /cluster/);
});
