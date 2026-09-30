import assert from "node:assert/strict";
import test from "node:test";
import { createSocialInviteShareContent } from "./social-invite-copy.ts";

const inviteUrl = "https://t.me/experiencesdotfun_bot?start=invite_example";

test("accountability invite copy has clear steps and preserves the friend-first consent order", () => {
  const content = createSocialInviteShareContent("accountability", "@alice", inviteUrl, "ios");

  assert.equal(content.title, "🤝 Accountability partner invite");
  assert.match(content.text, /^🤝 ACCOUNTABILITY PARTNER INVITE\n\n/);
  assert.match(content.text, /👤 Sign up with @alice/);
  assert.match(content.text, /1️⃣ Accept my friend request\n2️⃣ I’ll send your partner invitation once we’re connected/);
  assert.equal(content.text.includes(inviteUrl), false);
  assert.equal(content.message.includes(inviteUrl), false);
  assert.equal(content.url, inviteUrl);
});

test("friend invite copy has clear signup and connection steps", () => {
  const content = createSocialInviteShareContent("friend", "alice", inviteUrl, "web");

  assert.equal(content.title, "✨ Experiences.fun friend invite");
  assert.match(content.text, /^✨ FRIEND INVITE\n\n/);
  assert.match(content.text, /👤 Sign up with @alice\n🤝 Accept my friend request to connect/);
  assert.equal(content.text.includes(inviteUrl), false);
  assert.equal(content.url, inviteUrl);
});

test("share payload includes the link exactly once on platforms without a separate URL field", () => {
  for (const platform of ["android", "other"]) {
    const content = createSocialInviteShareContent("friend", "alice", inviteUrl, platform);

    assert.equal(content.url, undefined);
    assert.equal(content.text.includes(inviteUrl), false);
    assert.equal(content.message.split(inviteUrl).length - 1, 1);
  }
});