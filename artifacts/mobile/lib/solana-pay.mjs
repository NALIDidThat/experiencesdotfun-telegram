const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALLOWED_CLUSTERS = new Set(["mainnet-beta", "devnet", "testnet"]);

export function resolveSolanaCluster(configuredCluster, isDevelopment) {
  if (configuredCluster === undefined || configuredCluster === "") return isDevelopment ? "devnet" : "mainnet-beta";
  if (!ALLOWED_CLUSTERS.has(configuredCluster)) throw new Error("Unsupported Solana cluster.");
  return configuredCluster;
}

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

export function buildDonationUri({ recipient, amount, organisationName, fundTitle, fundId, cluster = "mainnet-beta" }) {
  if (!isValidSolanaAddress(recipient)) throw new Error("Invalid Solana recipient address.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000 || Number(amount.toFixed(9)) !== amount) {
    throw new Error("Donation amount must be positive SOL with at most 9 decimal places.");
  }
  if (!ALLOWED_CLUSTERS.has(cluster)) throw new Error("Unsupported Solana cluster.");

  const transferAmount = amount.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  const params = new URLSearchParams({
    amount: transferAmount,
    label: organisationName,
    message: fundTitle,
    memo: `Experiences.fun fund ${fundId}`,
  });
  if (cluster !== "mainnet-beta") params.set("cluster", cluster);
  return `solana:${recipient}?${params.toString()}`;
}
