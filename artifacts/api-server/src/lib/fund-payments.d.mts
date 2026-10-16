export interface SolTransfer {
  instructionIndex: string;
  sender: string;
  destination: string;
  amountLamports: string;
  campaignId: number | null;
  memo: string | null;
  references: string[];
  blockTime: string | null;
}
export function encodeBase58(bytes: Uint8Array): string;
export class SolanaRpcError extends Error {}
export function publicPaymentError(error: unknown): string;
export function decodeBase58(text: string): Buffer;
export function createPaymentReference(): string;
export function solToLamports(value: string): string;
export function paymentUri(input: { walletAddress: string; amountSol: string; reference: string; fundId: number; organisationName: string; cluster: string }): string;
export function solanaRpc(cluster: string, method: string, params: unknown[], fetchImpl?: typeof fetch): Promise<any>;
export function extractSolTransfers(transaction: unknown): SolTransfer[];
export function matchesPayment(transfer: SolTransfer, intent: { walletAddress: string; reference: string; amountLamports: string }): boolean;
export function readFinalizedTransfers(cluster: string, signature: string, fetchImpl?: typeof fetch): Promise<SolTransfer[]>;
