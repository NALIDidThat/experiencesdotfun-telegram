export function isValidSolanaAddress(address: string): boolean;
export function resolveSolanaCluster(
  configuredCluster: string | undefined,
  isDevelopment: boolean,
): "mainnet-beta" | "devnet" | "testnet";
export function buildDonationUri(input: {
  recipient: string;
  amount: number;
  organisationName: string;
  fundTitle: string;
  fundId: number;
  cluster?: "mainnet-beta" | "devnet" | "testnet";
}): string;
