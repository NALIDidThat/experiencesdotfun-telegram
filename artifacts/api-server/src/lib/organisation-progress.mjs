const milestoneIds = [
  "profile_ready",
  "first_experience",
  "first_verified_delivery",
  "repeat_participation",
];

const nextActionByMilestone = {
  profile_ready: "edit_profile",
  first_experience: "create_experience",
  first_verified_delivery: "manage_experiences",
  repeat_participation: "create_experience",
};

export function getOrganisationProgress({ organisation, experiences, participations }) {
  const ownedExperiences = organisation
    ? experiences.filter((experience) => experience.organisationId === organisation.id)
    : [];
  const publishedExperiences = ownedExperiences.filter((experience) => experience.status !== "draft");
  const ownedExperienceIds = new Set(publishedExperiences.map((experience) => experience.id));
  const verifiedExperienceIdsByParticipant = new Map();

  for (const participation of participations) {
    if (
      participation.status !== "verified"
      || participation.verifiedAt == null
      || !ownedExperienceIds.has(participation.experienceId)
    ) {
      continue;
    }

    const participantExperienceIds =
      verifiedExperienceIdsByParticipant.get(participation.userId) ?? new Set();
    participantExperienceIds.add(participation.experienceId);
    verifiedExperienceIdsByParticipant.set(participation.userId, participantExperienceIds);
  }

  const profileReady = Boolean(
    organisation
      && organisation.organisationType
      && organisation.name.trim()
      && organisation.description?.trim()
      && organisation.city?.trim()
      && organisation.categories.some((category) => category.trim()),
  );
  const firstExperience = publishedExperiences.length > 0;
  const firstVerifiedDelivery = [...verifiedExperienceIdsByParticipant.values()]
    .some((experienceIds) => experienceIds.size > 0);
  const repeatParticipation = [...verifiedExperienceIdsByParticipant.values()]
    .some((experienceIds) => experienceIds.size >= 2);

  const completedById = {
    profile_ready: profileReady,
    first_experience: firstExperience,
    first_verified_delivery: firstVerifiedDelivery,
    repeat_participation: repeatParticipation,
  };
  const milestones = milestoneIds.map((id) => ({ id, completed: completedById[id] }));
  const currentMilestoneId = milestones.find((milestone) => !milestone.completed)?.id ?? null;

  return {
    milestones,
    currentMilestoneId,
    nextAction: currentMilestoneId
      ? nextActionByMilestone[currentMilestoneId]
      : "create_experience",
  };
}
