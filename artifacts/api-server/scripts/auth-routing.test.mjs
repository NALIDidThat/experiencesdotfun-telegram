import assert from "node:assert/strict";
import test from "node:test";

const domain = process.env.REPLIT_DEV_DOMAIN;

test("email and Telegram login endpoints are public and reach their validators", async () => {
  assert.ok(domain, "REPLIT_DEV_DOMAIN must point to the running development API.");

  const cases = [
    ["/api/auth/email/login", "Enter either your email or username and your password."],
    ["/api/auth/telegram", "Telegram login data is missing."],
  ];

  for (const [path, expectedMessage] of cases) {
    const response = await fetch(`https://${domain}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 400, `${path} should reach its public validation handler`);
    assert.deepEqual(await response.json(), { message: expectedMessage });
  }
});