import assert from "node:assert/strict";
import test from "node:test";
import { getOrganisationProgress } from "./organisation-progress.mjs";

const organisation = {
  id: 1,
  name: "Community Garden",
  description: "A neighbourhood growing space.",
  city: "London",
  organisationType: "community_centre",
  categories: ["environmental"],
  verified: false,
};

function experience(id, organisationId = organisation.id, status = "published") {
  return { id, organisationId, status };
}

function participation(experienceId, userId, status = "verified", verifiedAt = new Date()) {
  return { experienceId, userId, status, verifiedAt };
}

function completed(progress) {
  return Object.fromEntries(progress.milestones.map(({ id, completed: isComplete }) => [id, isComplete]));
}

test("profile readiness requires the organisation essentials but not identity verification", () => {
  const progress = getOrganisationProgress({
    organisation,
    experiences: [],
    participations: [],
  });

  assert.equal(completed(progress).profile_ready, true);
  assert.equal(completed(progress).first_experience, false);
  assert.equal(progress.currentMilestoneId, "first_experience");
  assert.equal(progress.nextAction, "create_experience");
});

test("missing required organisation profile fields keep profile readiness incomplete", () => {
  for (const incompleteOrganisation of [
    { ...organisation, organisationType: null },
    { ...organisation, name: " " },
    { ...organisation, description: " " },
    { ...organisation, city: " " },
    { ...organisation, categories: [] },
  ]) {
    const progress = getOrganisationProgress({
      organisation: incompleteOrganisation,
      experiences: [],
      participations: [],
    });
    assert.equal(completed(progress).profile_ready, false);
  }
});

test("an organisation without a profile or experiences gets the profile setup action", () => {
  const progress = getOrganisationProgress({
    organisation: null,
    experiences: [],
    participations: [],
  });

  assert.deepEqual(completed(progress), {
    profile_ready: false,
    first_experience: false,
    first_verified_delivery: false,
    repeat_participation: false,
  });
  assert.equal(progress.currentMilestoneId, "profile_ready");
  assert.equal(progress.nextAction, "edit_profile");
});

test("the first experience is complete before a verified delivery exists", () => {
  const progress = getOrganisationProgress({
    organisation,
    experiences: [experience(10)],
    participations: [
      participation(10, 22, "submitted"),
      participation(10, 23, "verified", null),
    ],
  });

  assert.deepEqual(completed(progress), {
    profile_ready: true,
    first_experience: true,
    first_verified_delivery: false,
    repeat_participation: false,
  });
  assert.equal(progress.currentMilestoneId, "first_verified_delivery");
  assert.equal(progress.nextAction, "manage_experiences");
});

test("an unpublished draft does not count as an organisation experience", () => {
  const progress = getOrganisationProgress({
    organisation,
    experiences: [experience(10, organisation.id, "draft")],
    participations: [],
  });

  assert.equal(completed(progress).first_experience, false);
  assert.equal(progress.currentMilestoneId, "first_experience");
});

test("verified delivery requires a verified completion and verified timestamp", () => {
  const progress = getOrganisationProgress({
    organisation,
    experiences: [experience(10)],
    participations: [participation(10, 22)],
  });

  assert.equal(completed(progress).first_verified_delivery, true);
  assert.equal(completed(progress).repeat_participation, false);
});

test("repeat participation requires one participant verified across two distinct experiences", () => {
  const progress = getOrganisationProgress({
    organisation,
    experiences: [experience(10), experience(11), experience(12)],
    participations: [
      participation(10, 22),
      participation(11, 22),
      participation(12, 23),
    ],
  });

  assert.equal(completed(progress).first_verified_delivery, true);
  assert.equal(completed(progress).repeat_participation, true);
  assert.equal(progress.currentMilestoneId, null);
  assert.equal(progress.nextAction, "create_experience");
});

test("repeat participation ignores other organisations' experiences and completions", () => {
  const progress = getOrganisationProgress({
    organisation,
    experiences: [experience(10), experience(99, 2)],
    participations: [
      participation(10, 22),
      participation(99, 22),
    ],
  });

  assert.equal(completed(progress).first_experience, true);
  assert.equal(completed(progress).first_verified_delivery, true);
  assert.equal(completed(progress).repeat_participation, false);
  assert.equal(progress.currentMilestoneId, "repeat_participation");
});

test("different participants and duplicate completions on one experience do not count as repeat participation", () => {
  const progress = getOrganisationProgress({
    organisation,
    experiences: [experience(10), experience(11)],
    participations: [
      participation(10, 22),
      participation(10, 22),
      participation(11, 23),
    ],
  });

  assert.equal(completed(progress).repeat_participation, false);
});
