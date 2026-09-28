import assert from "node:assert/strict";
import test from "node:test";
import { toEmailSignupResponse } from "./email-auth-response.ts";

test("email signup response includes the new account session", () => {
  const user = { id: 321, email: "signup@example.test" };
  const sessionToken = "email_session_token";

  const response = toEmailSignupResponse(user, sessionToken);

  assert.deepEqual(response, { user, isNew: true, sessionToken });
});