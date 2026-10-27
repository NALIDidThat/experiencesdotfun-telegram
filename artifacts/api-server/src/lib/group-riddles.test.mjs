import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseGroupRiddle,
  chooseWrongRiddleAnswerResponse,
  createRiddleRoundStore,
  getGroupRiddleById,
  GROUP_RIDDLES,
  isCorrectGroupRiddleAnswer,
  normalizeRiddleAnswer,
  RIDDLE_REVEAL_AFTER_MS,
  TELEGRAM_COMMUNITY_RIDDLE_INTERVALS,
} from "./group-riddles.ts";

test("group riddles can be selected across the full random range", () => {
  assert.equal(chooseGroupRiddle(() => 0).id, GROUP_RIDDLES[0].id);
  assert.equal(chooseGroupRiddle(() => 0.999999).id, GROUP_RIDDLES.at(-1).id);
  assert.equal(
    chooseGroupRiddle(() => 0.5).id,
    GROUP_RIDDLES[Math.floor(GROUP_RIDDLES.length * 0.5)].id,
  );
});

test("wrong riddle answers receive playful feedback options", () => {
  assert.equal(chooseWrongRiddleAnswerResponse(() => 0), "Nexttttt! Who's got it?");
  assert.equal(chooseWrongRiddleAnswerResponse(() => 0.25), "Not quite. Anyone else?");
  assert.equal(
    chooseWrongRiddleAnswerResponse(() => 0.999999),
    "Ooh, not quite! Who's got another guess?",
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

test("community riddle intervals are bounded presets and stored IDs resolve safely", () => {
  assert.deepEqual(TELEGRAM_COMMUNITY_RIDDLE_INTERVALS, [30, 60, 180, 360, 720, 1440]);
  assert.equal(getGroupRiddleById(GROUP_RIDDLES[0].id), GROUP_RIDDLES[0]);
  assert.equal(getGroupRiddleById("missing-riddle"), null);
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
  assert.equal(rounds.getActive(-100, 1_003)?.messageId, 42);
  assert.equal(rounds.solve(-100, 42, "piano", 1_004)?.id, riddle.id);
  assert.equal(rounds.solve(-100, 42, "piano", 1_005), null);
  assert.equal(rounds.solve(1234, 44, "clock", 1_006)?.id, GROUP_RIDDLES[2].id);
});

test("persisted rounds restore with their original expiry and reject stale state", () => {
  const rounds = createRiddleRoundStore(60_000);
  const riddle = GROUP_RIDDLES[0];
  assert.equal(rounds.restore(-100, 42, riddle, 2_000, 1_000), true);
  assert.deepEqual(rounds.getActive(-100, 1_500), {
    messageId: 42,
    riddle,
    expiresAt: 2_000,
  });
  assert.equal(rounds.restore(-100, 43, GROUP_RIDDLES[1], 3_000, 1_500), false);
  assert.equal(rounds.restore(1234, 44, riddle, 3_000, 1_500), true);
  assert.equal(rounds.restore(-200, 45, riddle, 1_500, 1_500), false);
  assert.equal(rounds.reveal(-100, 42, 1_999), null);
  assert.equal(rounds.solve(-100, 42, "piano", 1_999)?.id, riddle.id);
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
