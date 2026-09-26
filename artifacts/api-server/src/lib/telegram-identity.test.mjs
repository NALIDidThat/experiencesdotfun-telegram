import assert from "node:assert/strict";
import test from "node:test";
import { hasSameTelegramIdentity, selectTelegramProfile } from "./telegram-identity.ts";

test("selects the requested role and never falls back to another established role", () => {
  const organisation = { id: 20, userType: "organisation" };
  const participant = { id: 10, userType: "participant" };
  assert.equal(selectTelegramProfile([participant, organisation], "organisation"), organisation);
  assert.equal(selectTelegramProfile([organisation], "participant"), undefined);
});

test("a requested role may claim an unassigned legacy profile", () => {
  const unassigned = { id: 8, userType: null };
  assert.equal(selectTelegramProfile([unassigned], "participant"), unassigned);
});

test("profiles with different IDs but one Telegram identity have the same owner", () => {
  assert.equal(
    hasSameTelegramIdentity(
      { id: 12, telegramId: "987654321" },
      { id: 34, telegramId: "987654321" },
    ),
    true,
  );
});

test("profiles with different Telegram identities have different owners", () => {
  assert.equal(
    hasSameTelegramIdentity(
      { telegramId: "987654321" },
      { telegramId: "123456789" },
    ),
    false,
  );
});