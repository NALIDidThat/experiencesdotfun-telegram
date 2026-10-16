import { randomBytes } from "node:crypto";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const CLUSTERS = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const MEMO_PROGRAMS = new Set(["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"]);

export class SolanaRpcError extends Error {
  name = "SolanaRpcError";
}

export function publicPaymentError(error) {
  const cause = error?.cause ?? error;
  if (cause?.code === "42P01" || cause?.code === "42703") {
    return "Fundraising ledger setup is pending. The database migration must be approved and applied before donations can be recorded.";
  }
  return error instanceof SolanaRpcError
    ? error.message
    : "Verification could not be completed. Your saved financial records are kept; please retry.";
}

export function encodeBase58(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let result = "";
  while (value > 0n) {
    result = BASE58[Number(value % 58n)] + result;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}

export function decodeBase58(text) {
  if (typeof text !== "string" || !text.length || text.length > 2000) throw new Error("Invalid base58 data.");
  let value = 0n;
  for (const ch of text) {
    const digit = BASE58.indexOf(ch);
    if (digit < 0) throw new Error("Invalid base58 data.");
    value = value * 58n + BigInt(digit);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const zeroes = text.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(zeroes), value ? Buffer.from(hex, "hex") : Buffer.alloc(0)]);
}

export const createPaymentReference = () => encodeBase58(randomBytes(32));

export function solToLamports(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,9})(\.\d{1,9})?$/.test(value)) {
    throw new Error("Enter a positive SOL amount with up to 9 decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (amount <= 0n || amount > 1_000_000_000_000_000_000n) throw new Error("SOL amount is out of range.");
  return String(amount);
}

export function paymentUri({ walletAddress, amountSol, reference, fundId, organisationName, cluster }) {
  const params = new URLSearchParams({
    amount: amountSol, reference, label: organisationName,
    message: `Support fund ${fundId}`, memo: `Experiences.fun fund ${fundId}`,
  });
  // cluster is a wallet extension, not part of the Solana Pay standard.
  if (cluster !== "mainnet-beta") params.set("cluster", cluster);
  return `solana:${walletAddress}?${params}`;
}

export async function solanaRpc(cluster, method, params, fetchImpl = fetch) {
  const url = CLUSTERS[cluster];
  if (!url) throw new SolanaRpcError("Unsupported Solana network.");
  try {
    const response = await fetchImpl(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new SolanaRpcError(`Solana RPC returned HTTP ${response.status}. Please retry.`);
    const payload = await response.json();
    if (payload.error) throw new SolanaRpcError("Solana could not verify this payment. Please retry.");
    return payload.result;
  } catch (error) {
    if (error instanceof SolanaRpcError) throw error;
    throw new SolanaRpcError("The Solana network could not be reached. Your request is saved; please retry.");
  }
}

// Read raw instructions: jsonParsed omits extra read-only reference accounts
// on parsed System Program instructions. Never infer a reference from a memo.
export function extractSolTransfers(transaction) {
  if (!transaction?.meta || transaction.meta.err !== null) return [];
  const message = transaction.transaction?.message;
  if (!message || !Array.isArray(message.accountKeys)) return [];
  const keys = [
    ...message.accountKeys,
    ...(transaction.meta.loadedAddresses?.writable ?? []),
    ...(transaction.meta.loadedAddresses?.readonly ?? []),
  ];
  const readOnly = new Set();
  const header = message.header;
  if (!header) return [];
  for (let i = header.numRequiredSignatures; i < message.accountKeys.length; i++) {
    if (i >= message.accountKeys.length - header.numReadonlyUnsignedAccounts) readOnly.add(keys[i]);
  }
  for (const key of transaction.meta.loadedAddresses?.readonly ?? []) readOnly.add(key);
  const groups = [{ prefix: "", instructions: message.instructions ?? [] },
    ...(transaction.meta.innerInstructions ?? []).map((group) => ({ prefix: `${group.index}.`, instructions: group.instructions ?? [] }))];
  const transfers = [];
  for (const group of groups) {
    for (let i = 0; i < group.instructions.length; i++) {
      const instruction = group.instructions[i];
      if (keys[instruction.programIdIndex] !== SYSTEM_PROGRAM) continue;
      try {
        const data = decodeBase58(instruction.data);
        if (data.length < 12) continue;
        const type = data.readUInt32LE(0);
        if (type !== 2 && type !== 11) continue; // transfer / transferWithSeed
        const source = keys[instruction.accounts[0]];
        const destination = keys[instruction.accounts[type === 11 ? 2 : 1]];
        const amountLamports = data.readBigUInt64LE(4).toString();
        if (!source || !destination || source === destination || BigInt(amountLamports) <= 0n) continue;
        const previous = group.instructions[i - 1];
        let campaignId = null;
        let memo = null;
        if (previous && MEMO_PROGRAMS.has(keys[previous.programIdIndex])) {
          memo = decodeBase58(previous.data).toString("utf8");
          const match = /^Experiences\.fun fund ([1-9]\d*)$/.exec(memo);
          if (match && Number.isSafeInteger(Number(match[1]))) campaignId = Number(match[1]);
        }
        transfers.push({
          instructionIndex: `${group.prefix}${i}`, sender: source, destination, amountLamports, campaignId, memo,
          references: instruction.accounts.map((index) => keys[index]).filter((key) => key !== source && key !== destination && readOnly.has(key)),
          blockTime: Number.isSafeInteger(transaction.blockTime) ? new Date(transaction.blockTime * 1000).toISOString() : null,
        });
      } catch {
        // An unsupported/malformed instruction must never produce ledger credit.
      }
    }
  }
  return transfers;
}

export function matchesPayment(transfer, intent) {
  return transfer.destination === intent.walletAddress
    && transfer.references.includes(intent.reference)
    && transfer.amountLamports === intent.amountLamports;
}

export async function readFinalizedTransfers(cluster, signature, fetchImpl = fetch) {
  const transaction = await solanaRpc(cluster, "getTransaction", [
    signature, { commitment: "finalized", encoding: "json", maxSupportedTransactionVersion: 0 },
  ], fetchImpl);
  if (!transaction?.meta) throw new SolanaRpcError("Finalized transaction details are unavailable. Retry verification later.");
  if (transaction.transaction?.signatures?.[0] !== signature) throw new SolanaRpcError("Solana returned a different transaction.");
  return extractSolTransfers(transaction);
}
