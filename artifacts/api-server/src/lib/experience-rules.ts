export function isExperienceJoinable(status: string): boolean {
  return status === "published";
}

export function canJoinOrWaitlist(status: string): boolean {
  return status === "published" || status === "full";
}

export function participationStatusForCapacity(
  participantCount: number,
  capacity: number,
): "joined" | "waitlisted" {
  return participantCount < capacity ? "joined" : "waitlisted";
}

export function canMarkAttendance(status: string): boolean {
  return status === "joined";
}

export function canSubmitCompletion(status: string): boolean {
  return status === "joined" || status === "attended" || status === "rejected";
}

export function canCancelParticipation(
  participation: {
    status: string;
    attendedAt: Date | null;
    submittedAt: Date | null;
    completionStatement: string | null;
    evidenceObjectKeys: string[];
    submissionVersion: number;
    verifiedAt: Date | null;
    reviewReason: string | null;
    reviewedByUserId: number | null;
    reviewedAt: Date | null;
    rewardStatus: string;
  },
  hasReviewHistory: boolean,
  hasMilestoneActivity: boolean,
): boolean {
  return participation.status === "joined"
    && participation.attendedAt === null
    && participation.submittedAt === null
    && participation.completionStatement === null
    && participation.evidenceObjectKeys.length === 0
    && participation.submissionVersion === 0
    && participation.verifiedAt === null
    && participation.reviewReason === null
    && participation.reviewedByUserId === null
    && participation.reviewedAt === null
    && participation.rewardStatus === "pending"
    && !hasReviewHistory
    && !hasMilestoneActivity;
}

export function isExperienceCancellationDateUpcoming(
  experienceDate: string,
  now = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(experienceDate)) return false;
  const parsedDate = new Date(`${experienceDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== experienceDate
  ) {
    return false;
  }
  return experienceDate > now.toISOString().slice(0, 10);
}

export function isValidExperienceSchedule(
  date: string,
  startTime: string,
  endTime: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return false;
  }

  const parseMinutes = (time: string): number | undefined => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!match) return undefined;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const start = parseMinutes(startTime);
  const end = parseMinutes(endTime);
  return start !== undefined && end !== undefined && end > start;
}