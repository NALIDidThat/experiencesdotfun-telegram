export function shouldStartTelegramPolling(
  nodeEnv: string | undefined,
  configuredValue: string | undefined,
): boolean {
  if (configuredValue === "true") return true;
  if (configuredValue === "false") return false;
  return nodeEnv === "production";
}

export function isTelegramPollingConflict(
  method: string,
  description: string | undefined,
): boolean {
  return method === "getUpdates" && Boolean(description?.toLowerCase().includes("conflict"));
}

export const TELEGRAM_POLLING_CONFLICT_BACKOFF_MS = 30_000;