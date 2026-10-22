export function getAppPreviewUrl(testName) {
  const configuredUrl = process.env.EXPO_WEB_PREVIEW_URL?.trim();
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      throw new Error("EXPO_WEB_PREVIEW_URL must be a valid HTTP or HTTPS URL.");
    }
  }

  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN?.trim();
  if (domain) {
    const url = domain.startsWith("http://") || domain.startsWith("https://")
      ? domain
      : `https://${domain}`;
    return new URL(url).origin;
  }

  throw new Error(`${testName} requires EXPO_WEB_PREVIEW_URL or REPLIT_EXPO_DEV_DOMAIN.`);
}
