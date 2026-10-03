import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalParticipantPair,
  isDirectMessageRateLimited,
  normalizedMessageBody,
  otherParticipantId,
} from "./direct-messaging-rules.ts";

test("canonicalizes the same pair regardless of who starts the conversation", () => {
  assert.deepEqual(canonicalParticipantPair(14, 8), {
    participantAUserId: 8,
    participantBUserId: 14,
  });
  assert.deepEqual(canonicalParticipantPair(8, 14), {
    participantAUserId: 8,
    participantBUserId: 14,
  });
});

test("rejects self conversations and invalid participant IDs", () => {
  assert.equal(canonicalParticipantPair(8, 8), null);
  assert.equal(canonicalParticipantPair(0, 8), null);
  assert.equal(canonicalParticipantPair(Number.MAX_SAFE_INTEGER + 1, 8), null);
});

test("only either conversation participant can resolve the other profile", () => {
  const conversation = { participantAUserId: 8, participantBUserId: 14 };
  assert.equal(otherParticipantId(conversation, 8), 14);
  assert.equal(otherParticipantId(conversation, 14), 8);
  assert.equal(otherParticipantId(conversation, 99), null);
});

test("trims messages and rejects empty or oversized text", () => {
  assert.equal(normalizedMessageBody("  hello there  "), "hello there");
  assert.equal(normalizedMessageBody(" \n "), null);
  assert.equal(normalizedMessageBody("x".repeat(2001)), null);
});

test("rate limit starts after thirty messages in the current window", () => {
  assert.equal(isDirectMessageRateLimited(29), false);
  assert.equal(isDirectMessageRateLimited(30), true);
});