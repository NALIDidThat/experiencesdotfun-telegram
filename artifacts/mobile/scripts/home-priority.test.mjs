import assert from "node:assert/strict";
import test from "node:test";
import {
  getParticipantHomeCommitments,
  selectOrganisationHomePriority,
  selectParticipantHomePriority,
} from "../lib/home-priority.ts";

const now = new Date("2026-10-22T10:00:00").getTime();

function participation(id, status, date = "2026-10-30", experienceStatus = "published") {
  return {
    id,
    status,
    experience: {
      id: id + 1000,
      title: `Experience ${id}`,
      date,
      startTime: "12:00",
      endTime: "14:00",
      status: experienceStatus,
    },
  };
}

test("participant priorities distinguish loading and failures from empty data", () => {
  assert.equal(selectParticipantHomePriority({ participationsLoading: true }).kind, "loading");
  assert.equal(selectParticipantHomePriority({ participationsError: true }).kind, "error");
  assert.equal(selectParticipantHomePriority({ participations: [], availableExperienceCount: 0 }).kind, "no-availability");
});

test("participant action-required work takes precedence over discovery and upcoming events", () => {
  const result = selectParticipantHomePriority({
    participations: [
      participation(1, "joined"),
      participation(2, "rejected"),
    ],
    availableExperienceCount: 4,
    now,
  });
  assert.equal(result.kind, "needs-update");
  assert.equal(result.experienceId, 1002);
});

test("participant priorities separate upcoming, waitlisted, and awaiting-review states", () => {
  assert.equal(
    selectParticipantHomePriority({ participations: [participation(1, "joined")], now }).kind,
    "upcoming",
  );
  assert.equal(
    selectParticipantHomePriority({ participations: [participation(1, "waitlisted")], now }).kind,
    "waitlisted",
  );
  assert.equal(
    selectParticipantHomePriority({ participations: [participation(1, "submitted")], now }).kind,
    "awaiting-review",
  );
});

test("participant upcoming counts exclude past, completed, and waitlisted records", () => {
  const result = selectParticipantHomePriority({
    participations: [
      participation(1, "joined", "2026-10-20"),
      participation(2, "joined", "2026-10-30", "completed"),
      participation(3, "waitlisted"),
      participation(4, "joined", "2026-10-30"),
    ],
    availableExperienceCount: 2,
    now,
  });
  assert.equal(result.kind, "upcoming");
  assert.equal(result.title, "1 experience coming up");
  assert.equal(result.experienceId, 1004);
});

test("participant commitments surface current status and omit verified history", () => {
  const commitments = getParticipantHomeCommitments([
    participation(1, "verified"),
    participation(2, "submitted"),
    participation(3, "rejected"),
  ], now);
  assert.deepEqual(commitments.map(({ statusLabel }) => statusLabel), [
    "Update requested",
    "Awaiting review",
  ]);
});

test("organisation priorities put reviews ahead of campaigns and treasury information", () => {
  const result = selectOrganisationHomePriority({
    pendingReviews: 2,
    experiences: [],
    totalExperiences: 0,
    isCharity: true,
    funds: [{ id: 1, title: "Garden", goalSol: 10, raisedSol: "2", status: "active" }],
    now,
  });
  assert.equal(result.kind, "reviews");
  assert.equal(result.action, "host");
});

test("organisation priorities surface the next event before fundraising", () => {
  const result = selectOrganisationHomePriority({
    pendingReviews: 0,
    experiences: [{ id: 5, title: "Cleanup", date: "2026-10-30", status: "published" }],
    totalExperiences: 1,
    isCharity: true,
    funds: [{ id: 1, title: "Garden", goalSol: 10, raisedSol: "2", status: "active" }],
    now,
  });
  assert.equal(result.kind, "experience");
  assert.equal(result.experienceId, 5);
});

test("organisation priorities never turn failed requests into zero-count claims", () => {
  assert.equal(
    selectOrganisationHomePriority({ overviewError: true, isCharity: false }).kind,
    "error",
  );
  assert.equal(
    selectOrganisationHomePriority({
      pendingReviews: 0,
      experiencesError: true,
      isCharity: false,
    }).kind,
    "error",
  );
});

test("charity campaign summaries use the campaign-linked contribution total", () => {
  const result = selectOrganisationHomePriority({
    pendingReviews: 0,
    experiences: [{ id: 3, title: "Past event", date: "2026-10-01", status: "completed" }],
    totalExperiences: 1,
    isCharity: true,
    funds: [{ id: 9, title: "Community garden", goalSol: 8, raisedSol: "1.25", status: "active" }],
    now,
  });
  assert.equal(result.kind, "campaign");
  assert.match(result.detail, /campaign-linked contributions 1\.25 of 8 SOL/);
  assert.equal(result.fundId, 9);
});
