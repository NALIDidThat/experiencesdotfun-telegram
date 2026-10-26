import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseGroupRiddle,
  createRiddleRoundStore,
  GROUP_RIDDLES,
  isCorrectGroupRiddleAnswer,
  normalizeRiddleAnswer,
  RIDDLE_REVEAL_AFTER_MS,
} from "./group-riddles.ts";

test("group riddles can be selected across the full random range", () => {
  assert.equal(chooseGroupRiddle(() => 0).id, GROUP_RIDDLES[0].id);
  assert.equal(chooseGroupRiddle(() => 0.999999).id, GROUP_RIDDLES.at(-1).id);
  assert.equal(
    chooseGroupRiddle(() => 0.5).id,
    GROUP_RIDDLES[Math.floor(GROUP_RIDDLES.length * 0.5)].id,
  );
});

test("catalog contains 100 new riddles with unique IDs and questions", () => {
  assert.equal(GROUP_RIDDLES.length, 110);
  assert.equal(new Set(GROUP_RIDDLES.map(({ id }) => id)).size, 110);
  assert.equal(
    new Set(GROUP_RIDDLES.map(({ question }) => normalizeRiddleAnswer(question))).size,
    110,
  );
  for (const riddle of GROUP_RIDDLES) {
    assert.ok(riddle.question.trim());
    assert.ok(riddle.answers.length > 0);
    for (const answer of riddle.answers) {
      assert.equal(isCorrectGroupRiddleAnswer(riddle.id, answer), true);
    }
  }
});

test("riddle answers ignore case, spacing, and punctuation", () => {
  assert.equal(normalizeRiddleAnswer("  A   STAMP! "), "astamp");
  assert.equal(isCorrectGroupRiddleAnswer("corner", "A stamp."), true);
  assert.equal(isCorrectGroupRiddleAnswer("drying", "TOWEL!!"), true);
});

test("only accepted answers solve a known riddle", () => {
  assert.equal(isCorrectGroupRiddleAnswer("keys", "piano"), true);
  assert.equal(isCorrectGroupRiddleAnswer("keys", "keyboard"), false);
  assert.equal(isCorrectGroupRiddleAnswer("missing-riddle", "piano"), false);
  assert.equal(isCorrectGroupRiddleAnswer("keys", "!!!"), false);
});

test("riddle rounds stay chat-scoped and only accept replies to the active riddle", () => {
  const rounds = createRiddleRoundStore(60_000);
  const riddle = GROUP_RIDDLES[0];
  assert.equal(rounds.start(-100, 42, riddle, 1_000), true);
  assert.equal(rounds.start(-100, 43, GROUP_RIDDLES[1], 1_001), false);
  assert.equal(rounds.start(-200, 43, GROUP_RIDDLES[1], 1_001), true);
  assert.equal(rounds.start(1234, 44, GROUP_RIDDLES[2], 1_001), true);
  assert.equal(rounds.solve(-100, 99, "piano", 1_002), null);
  assert.equal(rounds.solve(-100, 42, "keyboard", 1_003), null);
  assert.equal(rounds.solve(-100, 42, "piano", 1_004)?.id, riddle.id);
  assert.equal(rounds.solve(-100, 42, "piano", 1_005), null);
  assert.equal(rounds.solve(1234, 44, "clock", 1_006)?.id, GROUP_RIDDLES[2].id);
});

test("riddle answers are revealed after fifteen minutes and cannot then be solved", () => {
  assert.equal(RIDDLE_REVEAL_AFTER_MS, 15 * 60_000);
  const rounds = createRiddleRoundStore(10);
  assert.equal(rounds.start(-100, 42, GROUP_RIDDLES[0], 100), true);
  assert.equal(rounds.solve(-100, 42, "piano", 110), null);
  assert.equal(rounds.reveal(-100, 42, 109), null);
  assert.equal(rounds.reveal(-100, 41, 110), null);
  assert.equal(rounds.reveal(-100, 42, 110)?.riddle.id, GROUP_RIDDLES[0].id);
  assert.equal(rounds.reveal(-100, 42, 111), null);
  assert.equal(rounds.start(-100, 43, GROUP_RIDDLES[1], 110), true);
});

test("a delayed poll can reveal an expired round before starting the next one", () => {
  const rounds = createRiddleRoundStore(10);
  assert.equal(rounds.start(1234, 42, GROUP_RIDDLES[0], 100), true);
  assert.equal(rounds.revealExpired(1234, 109), null);
  assert.equal(rounds.revealExpired(1234, 110)?.messageId, 42);
  assert.equal(rounds.start(1234, 43, GROUP_RIDDLES[1], 110), true);
});
