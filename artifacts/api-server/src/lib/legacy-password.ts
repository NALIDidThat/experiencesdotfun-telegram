import crypto from "node:crypto";

export function verifyLegacyPassword(
  password: string,
  encodedHash: string | null,
): boolean {
  if (!encodedHash) return false;
  const [saltHex, hashHex] = encodedHash.split(":");
  if (!saltHex || !hashHex) return false;

  try {
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length === 0) return false;
    const actual = crypto.scryptSync(
      password,
      Buffer.from(saltHex, "hex"),
      expected.length,
    );
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}