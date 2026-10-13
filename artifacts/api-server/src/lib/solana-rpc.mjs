const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const RPC_BY_CLUSTER = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

export function isValidSolanaAddress(address) {
  if (typeof address !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
  let value = 0n;
  for (const character of address) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return false;
    value = value * 58n + BigInt(digit);
  }
  const bytes = value === 0n ? 0 : Math.ceil(value.toString(16).length / 2);
  const leadingZeroBytes = address.match(/^1*/)?.[0].length ?? 0;
  return bytes + leadingZeroBytes === 32;
}

export function lamportsToSol(lamports) {
  const value = BigInt(lamports);
  const whole = value / 1_000_000_000n;
  const fractional = String(value % 1_000_000_000n).padStart(9, "0");
  return `${whole}.${fractional}`;
}

function collectInstructions(transaction) {
  const instructions = transaction?.transaction?.message?.instructions ?? [];
  const inner = transaction?.meta?.innerInstructions?.flatMap((entry) => entry.instructions ?? []) ?? [];
  return [...instructions, ...inner];
}

function getIncomingLamports(transaction, address) {
  let total = 0n;
  const sources = new Set();
  for (const instruction of collectInstructions(transaction)) {
    const parsed = instruction?.parsed;
    const info = parsed?.info;
    if (
      instruction?.program === "system" &&
      parsed?.type?.startsWith("transfer") &&
      info?.destination === address &&
      (typeof info?.lamports === "number" || typeof info?.lamports === "string")
    ) {
      total += BigInt(info.lamports);
      if (typeof info.source === "string") sources.add(info.source);
    }
  }
  return { lamports: total, sender: sources.size ? [...sources].join(", ") : null };
}

async function rpcCall(url, method, params, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) throw new Error("Solana RPC request failed.");
  return payload.result;
}

export async function getSolanaBalance({ address, cluster, fetchImpl = fetch }) {
  if (!isValidSolanaAddress(address)) throw new Error("Invalid Solana treasury address.");
  const rpcUrl = RPC_BY_CLUSTER[cluster];
  if (!rpcUrl) throw new Error("Unsupported Solana cluster.");
  const result = await rpcCall(rpcUrl, "getBalance", [address, { commitment: "finalized" }], fetchImpl);
  if (!Number.isSafeInteger(result?.value) || result.value < 0) throw new Error("Solana RPC returned an invalid balance.");
  return String(result.value);
}

export async function getSolanaTreasuryActivity({
  address,
  cluster,
  limit = 20,
  before,
  fetchImpl = fetch,
}) {
  if (!isValidSolanaAddress(address)) throw new Error("Invalid Solana treasury address.");
  const rpcUrl = RPC_BY_CLUSTER[cluster];
  if (!rpcUrl) throw new Error("Unsupported Solana cluster.");
  const safeLimit = Math.max(1, Math.min(25, Math.floor(limit)));
  const options = { commitment: "finalized", limit: safeLimit };
  if (before) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(before)) throw new Error("Invalid transaction cursor.");
    options.before = before;
  }

  const signatures = await rpcCall(rpcUrl, "getSignaturesForAddress", [address, options], fetchImpl);
  if (!Array.isArray(signatures)) throw new Error("Solana RPC returned invalid transaction history.");
  const transactions = [];
  for (let index = 0; index < signatures.length; index += 5) {
    const batch = await Promise.all(signatures.slice(index, index + 5).map(async (entry) => {
      if (entry.err) {
        return {
          signature: entry.signature,
          status: "failed",
          sender: null,
          amountSol: null,
          blockTime: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
          error: "Transaction failed on-chain.",
        };
      }
      try {
        const transaction = await rpcCall(
          rpcUrl,
          "getTransaction",
          [entry.signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
          fetchImpl,
        );
        if (!transaction?.meta || transaction.meta.err) {
          return {
            signature: entry.signature,
            status: "unavailable",
            sender: null,
            amountSol: null,
            blockTime: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
            error: "Transaction details are not available from the RPC.",
          };
        }
        const incoming = getIncomingLamports(transaction, address);
        if (incoming.lamports <= 0n) return null;
        return {
          signature: entry.signature,
          status: "confirmed",
          sender: incoming.sender,
          amountSol: lamportsToSol(incoming.lamports),
          blockTime: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
          error: null,
        };
      } catch {
        return {
          signature: entry.signature,
          status: "unavailable",
          sender: null,
          amountSol: null,
          blockTime: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
          error: "Transaction details are not available from the RPC.",
        };
      }
    }));
    transactions.push(...batch.filter(Boolean));
  }
  return {
    transactions,
    nextCursor: signatures.length === safeLimit ? signatures.at(-1).signature : null,
    hasMore: signatures.length === safeLimit,
  };
}
