export function isHttpsEvidenceUrl(value) {
  if (typeof value !== "string" || value.slice(0, 8).toLowerCase() !== "https://") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
