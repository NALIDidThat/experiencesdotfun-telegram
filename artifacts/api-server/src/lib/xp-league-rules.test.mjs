import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeagueHistory,
  buildLeagueStandings,
  filterOptedInLeagueEntries,
  getXpToNextRank,
  getUtcLeagueWeek,
  paginateLeagueEntries,
  rankLeagueEntries,
} from "./xp-league-rules.mjs";

const member = (userId, overrides = {}) => ({
  userId,
  category: "environmental",
  userType: "participant",
  name: `Participant ${userId}`,
  username: null,
  avatarUrl: null,
  optedInAt: "2026-03-02T00:00:00.000Z",
  optedOutAt: null,
  division: 1,
  ...overrides,
});

const event = (userId, sourceId, amount, overrides = {}) => ({
  userId,
  sourceType: "experience",
  sourceId,
  category: "environmental",
  amount,
  status: "verified",
  parentParticipationStatus: "verified",
  awardedAt: "2026-03-03T12:00:00.000Z",
  verifiedAt: "2026-03-03T12:00:00.000Z",
  ...overrides,
});

test("league weeks start Monday at 00:00 UTC and end at the next Monday", () => {
  assert.deepEqual(
    {
      start: getUtcLeagueWeek(new Date("2026-03-02T00:00:00.000Z")).weekStart,
      end: getUtcLeagueWeek(new Date("2026-03-02T00:00:00.000Z")).weekEnd,
    },
    { start: "2026-03-02", end: "2026-03-09" },
  );
  assert.deepEqual(
    {
      start: getUtcLeagueWeek(new Date("2026-03-08T23:59:59.999Z")).weekStart,
      end: getUtcLeagueWeek(new Date("2026-03-08T23:59:59.999Z")).weekEnd,
    },
    { start: "2026-03-02", end: "2026-03-09" },
  );
  assert.equal(
    getUtcLeagueWeek(new Date("2026-03-09T00:00:00.000Z")).weekStart,
    "2026-03-09",
  );
});

test("only verified Experience XP in the selected category is counted once", () => {
  const standings = buildLeagueStandings({
    category: "environmental",
    weekStart: "2026-03-02",
    members: [member(1), member(2)],
    events: [
      event(1, "participation-1", 25, { currentExperienceCategory: "education" }),
      event(1, "participation-1", 25),
      event(1, "milestone-1", 10, {
        sourceType: "milestone",
        parentParticipationStatus: "in_progress",
      }),
      event(1, "pending", 90, { status: "submitted" }),
      event(1, "mismatch", 80, { verifiedAt: "2026-03-03T13:00:00.000Z" }),
      event(1, "memory", 100, { sourceType: "memory_game" }),
      event(1, "community", 100, { sourceType: "community" }),
      event(1, "other-category", 500, { category: "education" }),
      event(1, "bad-value", -1),
      event(2, "valid", 5, { status: "rejected" }),
      event(2, "completion-not-verified", 80, { parentParticipationStatus: "in_progress" }),
    ],
  });

  assert.equal(standings.find((row) => row.userId === 1)?.scoreXp, 35);
  assert.equal(standings.find((row) => row.userId === 2)?.scoreXp, 0);
  assert.throws(() => buildLeagueStandings({
    category: "all",
    weekStart: "2026-03-02",
    members: [],
    events: [],
  }), /supported Experience category/);
});

test("verification time, not redemption time, selects the earning week", () => {
  const pendingAtVerification = event(1, "award-1", 40, {
    awardStatus: "pending",
    awardedAt: "2026-03-08T23:59:59.999Z",
    verifiedAt: "2026-03-08T23:59:59.999Z",
  });
  const redeemedLater = { ...pendingAtVerification, awardStatus: "redeemed" };
  const closingWeek = (award) => buildLeagueStandings({
    category: "environmental",
    weekStart: "2026-03-02",
    members: [member(1)],
    events: [award],
  })[0]?.scoreXp;
  assert.equal(closingWeek(pendingAtVerification), 40);
  assert.equal(closingWeek(redeemedLater), 40);

  const nextWeekAward = {
    ...pendingAtVerification,
    awardedAt: "2026-03-09T00:00:00.000Z",
    verifiedAt: "2026-03-09T00:00:00.000Z",
  };
  assert.equal(closingWeek(nextWeekAward), 0);
});

test("late opt-in timestamps bound scoring and midweek exits do not affect final ranks", () => {
  const joinedMidweek = member(1, { optedInAt: "2026-03-05T00:00:00.000Z" });
  const optedOutMidweek = member(2, { optedOutAt: "2026-03-05T00:00:00.000Z" });
  const optedOutAtWeekClose = member(3, { optedOutAt: "2026-03-09T00:00:00.000Z" });
  const standings = buildLeagueStandings({
    category: "environmental",
    weekStart: "2026-03-02",
    members: [joinedMidweek, optedOutMidweek, optedOutAtWeekClose],
    events: [
      event(1, "before-join", 10, { awardedAt: "2026-03-04T00:00:00.000Z", verifiedAt: "2026-03-04T00:00:00.000Z" }),
      event(1, "after-join", 12, { awardedAt: "2026-03-05T00:00:00.000Z", verifiedAt: "2026-03-05T00:00:00.000Z" }),
      event(2, "before-leave", 8, { awardedAt: "2026-03-04T00:00:00.000Z", verifiedAt: "2026-03-04T00:00:00.000Z" }),
      event(2, "after-leave", 30, { awardedAt: "2026-03-06T00:00:00.000Z", verifiedAt: "2026-03-06T00:00:00.000Z" }),
      event(3, "before-week-close", 15),
    ],
  });
  assert.equal(standings.find((row) => row.userId === 1)?.scoreXp, 12);
  assert.equal(standings.find((row) => row.userId === 2), undefined);
  assert.equal(standings.find((row) => row.userId === 3)?.scoreXp, 15);
});

test("equal XP uses first award, opt-in time, and profile ID in order", () => {
  const standings = rankLeagueEntries([
    { userId: 3, division: 1, scoreXp: 20, firstAwardedAt: "2026-03-03T12:00:00Z", optedInAt: "2026-03-02T00:00:00Z" },
    { userId: 2, division: 1, scoreXp: 20, firstAwardedAt: "2026-03-03T11:00:00Z", optedInAt: "2026-03-02T00:00:00Z" },
    { userId: 1, division: 1, scoreXp: 20, firstAwardedAt: "2026-03-03T11:00:00Z", optedInAt: "2026-03-01T00:00:00Z" },
  ]);
  assert.deepEqual(standings.map((row) => row.userId), [1, 2, 3]);
  assert.deepEqual(standings.map((row) => row.rank), [1, 2, 3]);
});

test("next-rank progress includes one XP to break a score tie", () => {
  assert.equal(getXpToNextRank(10, 15), 6);
  assert.equal(getXpToNextRank(15, 15), 1);
  assert.equal(getXpToNextRank(15, null), null);
});

test("division changes are deterministic and require at least five participants", () => {
  const five = rankLeagueEntries([1, 2, 3, 4, 5].map((userId) => ({
    userId,
    division: 1,
    scoreXp: 100 - userId,
    optedInAt: "2026-03-02T00:00:00.000Z",
  })));
  assert.equal(five.find((row) => row.userId === 1)?.movement, "promoted");
  assert.equal(five.find((row) => row.userId === 1)?.nextDivision, 2);
  assert.equal(five.find((row) => row.userId === 5)?.movement, "held");

  const gold = rankLeagueEntries([1, 2, 3, 4, 5].map((userId) => ({
    userId,
    division: 3,
    scoreXp: 100 - userId,
    optedInAt: "2026-03-02T00:00:00.000Z",
  })));
  assert.equal(gold.find((row) => row.userId === 1)?.movement, "held");
  assert.equal(gold.find((row) => row.userId === 5)?.movement, "demoted");

  const smallDivision = rankLeagueEntries([1, 2, 3, 4].map((userId) => ({
    userId,
    division: 2,
    scoreXp: 100 - userId,
  })));
  assert.ok(smallDivision.every((row) => row.movement === "held"));
});

test("only opted-in users are visible and pages have stable bounded sizes", () => {
  const visible = filterOptedInLeagueEntries([
    { userId: 1, optedIn: true },
    { userId: 2, optedIn: false },
    { userId: 3 },
  ]);
  assert.deepEqual(visible.map((row) => row.userId), [1]);
  assert.deepEqual(
    paginateLeagueEntries(Array.from({ length: 27 }, (_, index) => index + 1), 2, 20),
    { entries: [21, 22, 23, 24, 25, 26, 27], page: 2, pageSize: 20, total: 27, hasMore: false },
  );
  assert.equal(paginateLeagueEntries([1, 2], 1, 80).pageSize, 20);
});

test("weekly history is newest first, preserves movement, and keeps twelve weeks", () => {
  const saved = Array.from({ length: 14 }, (_, index) => ({
    weekStart: new Date(Date.UTC(2026, 2, 2 + index * 7)).toISOString().slice(0, 10),
    rank: index + 1,
    scoreXp: 100 + index,
    division: 1 + (index % 3),
    movement: index % 2 ? "held" : "promoted",
  }));
  const history = buildLeagueHistory(saved, 12);
  assert.equal(history.length, 12);
  assert.ok(history[0].weekStart >= history.at(-1).weekStart);
  assert.equal(history[0].weekEnd, "2026-06-08");
  assert.equal(history.at(-1).movement, "promoted");
});
