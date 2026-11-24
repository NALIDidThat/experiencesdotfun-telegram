export function deriveJourneyProgress(
  steps: Array<{ id: number; kind: string }>,
  evidenceByStepId: Map<number, { id: number; verifiedAt: Date | string }>,
): {
  steps: Array<{
    stepId: number;
    status: "resource" | "complete" | "incomplete";
    sourceRecordId: number | null;
    verifiedAt: string | null;
  }>;
  totalSteps: number;
  eligibleSteps: number;
  completedSteps: number;
  completionPercent: number;
  isComplete: boolean;
};
export function getJourneyProgrammeMetrics(
  enrolments: Array<{ status: string }>,
): {
  activeParticipants: number;
  completedParticipants: number;
  withdrawnParticipants: number;
  completionRatePercent: number;
};
export function nextJourneyEnrolmentStatus(
  currentStatus: "active" | "completed" | "withdrawn",
  progress: { isComplete: boolean },
): "active" | "completed" | "withdrawn";
export function journeyStepCompletionDedupeKey(
  enrolmentId: number,
  stepId: number,
): string;
export function canManageJourneyProgramme(
  accountType: string | null,
  accountOrganisationId: number | null,
  programmeOrganisationId: number,
): boolean;
export function canReadJourneyEnrolment(
  accountType: string | null,
  accountUserId: number,
  enrolmentUserId: number,
): boolean;
