export function isValidSolanaAddress(address: string): boolean;
export function lamportsToSol(lamports: string | number | bigint): string;
export function getSolanaBalance(input: {
  address: string;
  cluster: string;
  fetchImpl?: typeof fetch;
}): Promise<string>;
export function getSolanaTreasuryActivity(input: {
  address: string;
  cluster: string;
  limit?: number;
  before?: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  transactions: Array<{
    signature: string;
    status: "confirmed" | "failed" | "unavailable";
    sender: string | null;
    amountSol: string | null;
    blockTime: string | null;
    error: string | null;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}>;
