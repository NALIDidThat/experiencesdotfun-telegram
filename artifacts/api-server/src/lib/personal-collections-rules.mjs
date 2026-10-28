const MAX_PHOTOS = 5;
const MAX_LINKS = 5;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 5000;
const MAX_URL_LENGTH = 2048;

function cleanOptionalText(value, maxLength, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  return cleaned || null;
}

function cleanStringList(value, limit, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a list of text values.`);
  }
  const cleaned = value.map((item) => item.trim()).filter(Boolean);
  if (cleaned.length > limit) throw new Error(`Add no more than ${limit} ${label.toLowerCase()}.`);
  if (new Set(cleaned).size !== cleaned.length) throw new Error(`${label} cannot contain duplicates.`);
  return cleaned;
}

function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function normalizePersonalMemory(input, userId, existing = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Add a note, photo, or link before saving." };
  }

  try {
    const title = input.title === undefined && existing
      ? existing.title
      : cleanOptionalText(input.title, MAX_TITLE_LENGTH, "Title");
    const body = input.body === undefined && existing
      ? existing.body
      : cleanOptionalText(input.body, MAX_BODY_LENGTH, "Note");
    const photoObjectKeys = input.photoObjectKeys === undefined && existing
      ? existing.photoObjectKeys
      : cleanStringList(input.photoObjectKeys ?? [], MAX_PHOTOS, "Photos");
    const links = input.links === undefined && existing
      ? existing.links
      : cleanStringList(input.links ?? [], MAX_LINKS, "Links");

    if (
      photoObjectKeys.some((key) =>
        key.length > 200 ||
        key.includes("..") ||
        key.startsWith("/") ||
        !new RegExp(`^${userId}/memories/[0-9a-f-]{36}$`, "i").test(key))
    ) {
      throw new Error("Add photos uploaded to this memory collection.");
    }
    if (links.some((link) => !isSafeHttpsUrl(link))) {
      throw new Error("Use secure HTTPS links without embedded sign-in details.");
    }
    if (!title && !body && !photoObjectKeys.length && !links.length) {
      throw new Error("Add a note, photo, or link before saving.");
    }

    return { ok: true, value: { title, body, photoObjectKeys, links } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "This memory couldn’t be saved.",
    };
  }
}
