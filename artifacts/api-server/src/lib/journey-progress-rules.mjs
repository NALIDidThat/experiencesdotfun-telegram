export function deriveJourneyProgress(steps, evidenceByStepId) {
  const stepProgress = steps.map((step) => {
    if (step.kind === "resource") {
      return {
        stepId: step.id,
        status: "resource",
        sourceRecordId: null,
        verifiedAt: null,
      };
    }
    const evidence = evidenceByStepId.get(step.id);
    return {
      stepId: step.id,
      status: evidence ? "complete" : "incomplete",
      sourceRecordId: evidence?.id ?? null,
      verifiedAt: evidence?.verifiedAt?.toISOString?.() ?? evidence?.verifiedAt ?? null,
    };
  });
  const eligibleSteps = stepProgress.filter((step) => step.status !== "resource").length;
  const completedSteps = stepProgress.filter((step) => step.status === "complete").length;
  return {
    steps: stepProgress,
    totalSteps: steps.length,
    eligibleSteps,
    completedSteps,
    completionPercent: eligibleSteps
      ? Math.round((completedSteps / eligibleSteps) * 100)
      : 0,
    isComplete: eligibleSteps > 0 && completedSteps === eligibleSteps,
  };
}

export function getJourneyProgrammeMetrics(enrolments) {
  const activeParticipants = enrolments.filter((item) => item.status === "active").length;
  const completedParticipants = enrolments.filter((item) => item.status === "completed").length;
  const withdrawnParticipants = enrolments.filter((item) => item.status === "withdrawn").length;
  const eligibleParticipants = activeParticipants + completedParticipants;
  return {
    activeParticipants,
    completedParticipants,
    withdrawnParticipants,
    completionRatePercent: eligibleParticipants
      ? Math.round((completedParticipants / eligibleParticipants) * 100)
      : 0,
  };
}

export function nextJourneyEnrolmentStatus(currentStatus, progress) {
  return currentStatus === "active" && progress.isComplete
    ? "completed"
    : currentStatus;
}

export function journeyStepCompletionDedupeKey(enrolmentId, stepId) {
  return `step:${enrolmentId}:${stepId}`;
}

export function canManageJourneyProgramme(accountType, accountOrganisationId, programmeOrganisationId) {
  return accountType === "organisation"
    && Number.isSafeInteger(accountOrganisationId)
    && accountOrganisationId > 0
    && accountOrganisationId === programmeOrganisationId;
}

export function canReadJourneyEnrolment(accountType, accountUserId, enrolmentUserId) {
  return accountType === "participant"
    && Number.isSafeInteger(accountUserId)
    && accountUserId > 0
    && accountUserId === enrolmentUserId;
}
