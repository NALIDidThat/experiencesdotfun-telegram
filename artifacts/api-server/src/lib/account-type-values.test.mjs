import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthenticateTelegramBody,
  SignUpWithEmailBody,
} from "../../../../lib/api-zod/src/generated/api.ts";
import {
  emailProfileValues,
  telegramProfileRoleUpdate,
  telegramProfileValues,
} from "./account-type-values.ts";

const roles = ["participant", "organisation"];

test("email signup accepts and persists each selected account role", () => {
  for (const userType of roles) {
    const input = {
      name: "  Sam Example  ",
      username: "sam_example",
      email: "sam@example.com",
      password: "password123",
      userType,
    };

    assert.equal(SignUpWithEmailBody.safeParse(input).success, true);
    assert.deepEqual(
      emailProfileValues(input, "email:test-id"),
      {
        telegramId: "email:test-id",
        name: "Sam Example",
        username: "sam_example",
        userType,
        xp: 50,
      },
    );
  }
});

test("Telegram initialization accepts and assigns each selected role to new profiles", () => {
  for (const userType of roles) {
    const input = { initData: "signed-init-data", userType };
    assert.equal(AuthenticateTelegramBody.safeParse(input).success, true);
    assert.deepEqual(
      telegramProfileValues({ id: 123, first_name: "Sam" }, undefined, userType),
      {
        name: "Sam",
        username: null,
        avatarUrl: null,
        userType,
      },
    );
  }
});

test("Telegram initialization applies a selected role to an untyped profile", () => {
  for (const userType of roles) {
    assert.deepEqual(telegramProfileRoleUpdate(null, userType), { userType });
  }
});

test("a conflicting Telegram selection leaves an established server role unchanged", () => {
  assert.deepEqual(telegramProfileRoleUpdate("organisation", "participant"), {});
  assert.deepEqual(telegramProfileRoleUpdate("participant", "organisation"), {});
});

test("an untyped Telegram profile stays untyped when no role is selected", () => {
  assert.deepEqual(telegramProfileRoleUpdate(null), {});
  assert.equal(telegramProfileValues({ id: 123 }, undefined).userType, null);
});