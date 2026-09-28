import assert from "node:assert/strict";
import test from "node:test";
import { toEmailSignupResponse } from "./email-auth-response.ts";

test("email signup response creates the account without an authenticated session", () => {
  const user = { id: 321, email: "signup@example.test" };

  const response = toEmailSignupResponse(user);

  assert.deepEqual(response, { user, isNew: true });
  assert.equal(Object.hasOwn(response, "sessionToken"), false);
});