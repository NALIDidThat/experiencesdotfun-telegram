import assert from "node:assert/strict";
import test from "node:test";
import {
  canClaimSocialInvite,
  createInviteToken,
  inviteTokenHash,
  shareUrl,
} from "./social-invite-utils.ts";

test("shareable invite tokens are opaque, hashed, and fit Telegram start payloads", () => {
  const first = createInviteToken();
  const second = createInviteToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(inviteTokenHash(first), inviteTokenHash(first));
  assert.notEqual(inviteTokenHash(first), first);
  assert.equal(inviteTokenHash(first).length, 64);
  assert.equal(new URL(shareUrl(first)).searchParams.get("start"), `invite_${first}`);
  assert.ok(`invite_${first}`.length <= 64);
});

test("social invite claims require the intended Telegram username and an unexpired token", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const invite = {
    targetUsername: "alice_user",
    expiresAt: new Date("2026-10-14T12:00:00.000Z"),
    claimedAt: null,
  };

  assert.equal(canClaimSocialInvite(invite, "@Alice_User", now), true);
  assert.equal(canClaimSocialInvite(invite, "another_user", now), false);
  assert.equal(canClaimSocialInvite({ ...invite, claimedAt: now }, "alice_user", now), false);
  assert.equal(canClaimSocialInvite({ ...invite, expiresAt: now }, "alice_user", now), false);
  assert.equal(canClaimSocialInvite(invite, null, now), false);
});