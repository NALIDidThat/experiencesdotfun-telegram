export function shouldStartTelegramPolling(
  nodeEnv: string | undefined,
  configuredValue: string | undefined,
): boolean {
  if (configuredValue === "true") return true;
  if (configuredValue === "false") return false;
  return nodeEnv === "production";
}