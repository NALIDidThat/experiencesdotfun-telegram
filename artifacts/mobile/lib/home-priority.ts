export type ParticipantHomeParticipation = {
  id: number;
  status: "joined" | "attended" | "submitted" | "verified" | "rejected" | "waitlisted";
  experience: {
    id: number;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
  };
};

export type ParticipantCommitment = {
  id: number;
  experienceId: number;
  title: string;
  date: string;
  statusLabel: string;
};

type ParticipantPriorityKind =
  | "loading"
  | "error"
  | "needs-update"
  | "submit-completion"
  | "upcoming"
  | "waitlisted"
  | "awaiting-review"
  | "discover"
  | "no-availability"
  | "cancelled";

export type ParticipantHomePriority = {
  kind: ParticipantPriorityKind;
  title: string;
  detail: string;
  buttonLabel: string;
  accessibilityLabel: string;
  icon: "clock" | "alert-circle" | "edit-3" | "check-circle" | "calendar" | "users" | "compass";
  experienceId?: number;
};

export type ParticipantHomePriorityInput = {
  participations?: ParticipantHomeParticipation[];
  participationsLoading?: boolean;
  participationsError?: boolean;
  availableExperienceCount?: number;
  experiencesLoading?: boolean;
  experiencesError?: boolean;
  now?: number;
};

function eventTime(date: string, time: string): number | null {
  const value = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

function isCancelled(participation: ParticipantHomeParticipation) {
  return participation.experience.status === "cancelled";
}

function isUpcoming(participation: ParticipantHomeParticipation, now: number) {
  const end = eventTime(participation.experience.date, participation.experience.endTime);
  return end !== null
    && end >= now
    && ["published", "full"].includes(participation.experience.status);
}

function participantCommitmentStatus(participation: ParticipantHomeParticipation): string {
  if (isCancelled(participation)) return "Cancelled";
  switch (participation.status) {
    case "rejected":
      return "Update requested";
    case "attended":
      return "Completion to submit";
    case "submitted":
      return "Awaiting review";
    case "waitlisted":
      return "Waitlisted";
    case "verified":
      return "Verified";
    default:
      return "Joined";
  }
}

function commitmentRank(participation: ParticipantHomeParticipation, now: number): number {
  if (isCancelled(participation)) return 0;
  if (participation.status === "rejected") return 1;
  if (participation.status === "attended") return 2;
  if (participation.status === "joined" && isUpcoming(participation, now)) return 3;
  if (participation.status === "waitlisted" && isUpcoming(participation, now)) return 4;
  if (participation.status === "submitted") return 5;
  if (participation.status === "waitlisted") return 6;
  return 7;
}

export function getParticipantHomeCommitments(
  participations: ParticipantHomeParticipation[] | undefined,
  now = Date.now(),
): ParticipantCommitment[] {
  return (participations ?? [])
    .filter((participation) => participation.status !== "verified")
    .sort((left, right) => {
      const rankDifference = commitmentRank(left, now) - commitmentRank(right, now);
      if (rankDifference !== 0) return rankDifference;
      const leftTime = eventTime(left.experience.date, left.experience.startTime) ?? Number.MAX_SAFE_INTEGER;
      const rightTime = eventTime(right.experience.date, right.experience.startTime) ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    })
    .slice(0, 3)
    .map((participation) => ({
      id: participation.id,
      experienceId: participation.experience.id,
      title: participation.experience.title,
      date: participation.experience.date,
      statusLabel: participantCommitmentStatus(participation),
    }));
}

export function selectParticipantHomePriority(
  input: ParticipantHomePriorityInput,
): ParticipantHomePriority {
  const now = input.now ?? Date.now();
  const rows = input.participations;
  if (!rows && input.participationsLoading) {
    return {
      kind: "loading",
      title: "Checking your next step…",
      detail: "Your experience commitments are loading.",
      buttonLabel: "Please wait",
      accessibilityLabel: "Loading your next experience action",
      icon: "clock",
    };
  }
  if (!rows && input.participationsError) {
    return {
      kind: "error",
      title: "Your commitments couldn’t load",
      detail: "Retry to check for updates or upcoming experiences.",
      buttonLabel: "Retry",
      accessibilityLabel: "Retry loading your commitments",
      icon: "alert-circle",
    };
  }

  const participations = rows ?? [];
  const cancelled = participations.find(
    (item) => item.status !== "verified" && isCancelled(item),
  );
  if (cancelled) {
    return {
      kind: "cancelled",
      title: "An experience was cancelled",
      detail: cancelled.experience.title,
      buttonLabel: "Review details",
      accessibilityLabel: `Review cancelled experience ${cancelled.experience.title}`,
      icon: "alert-circle",
      experienceId: cancelled.experience.id,
    };
  }

  const needsUpdate = participations.find((item) => item.status === "rejected");
  if (needsUpdate) {
    return {
      kind: "needs-update",
      title: "An update was requested",
      detail: `${needsUpdate.experience.title} needs your attention. Review the organiser’s feedback.`,
      buttonLabel: "Review and update",
      accessibilityLabel: `Review the requested update for ${needsUpdate.experience.title}`,
      icon: "edit-3",
      experienceId: needsUpdate.experience.id,
    };
  }

  const completionToSubmit = participations.find((item) => item.status === "attended");
  if (completionToSubmit) {
    return {
      kind: "submit-completion",
      title: "Record your contribution",
      detail: `Your attendance at ${completionToSubmit.experience.title} is recorded.`,
      buttonLabel: "Continue submission",
      accessibilityLabel: `Submit your completion for ${completionToSubmit.experience.title}`,
      icon: "check-circle",
      experienceId: completionToSubmit.experience.id,
    };
  }

  const upcoming = participations
    .filter((item) => item.status === "joined" && isUpcoming(item, now))
    .sort((left, right) => (
      (eventTime(left.experience.date, left.experience.startTime) ?? Number.MAX_SAFE_INTEGER)
      - (eventTime(right.experience.date, right.experience.startTime) ?? Number.MAX_SAFE_INTEGER)
    ));
  if (upcoming.length) {
    const first = upcoming[0];
    return {
      kind: "upcoming",
      title: `${upcoming.length} experience${upcoming.length === 1 ? "" : "s"} coming up`,
      detail: upcoming.length === 1
        ? `${first.experience.title} is on your calendar.`
        : `Your next experience is ${first.experience.title}.`,
      buttonLabel: "View upcoming experiences",
      accessibilityLabel: "Open your upcoming experiences",
      icon: "calendar",
      experienceId: first.experience.id,
    };
  }

  const waitlisted = participations.find((item) => (
    item.status === "waitlisted" && isUpcoming(item, now)
  ));
  if (waitlisted) {
    return {
      kind: "waitlisted",
      title: "You’re on the waitlist",
      detail: `Check the latest details for ${waitlisted.experience.title}.`,
      buttonLabel: "View waitlist status",
      accessibilityLabel: `View your waitlist status for ${waitlisted.experience.title}`,
      icon: "users",
      experienceId: waitlisted.experience.id,
    };
  }

  const submitted = participations.find((item) => item.status === "submitted");
  if (submitted) {
    return {
      kind: "awaiting-review",
      title: "Your submission is with the organiser",
      detail: `${submitted.experience.title} is awaiting review. No action is needed right now.`,
      buttonLabel: "View submission",
      accessibilityLabel: `View the submission for ${submitted.experience.title}`,
      icon: "clock",
      experienceId: submitted.experience.id,
    };
  }

  if (input.experiencesLoading && input.availableExperienceCount === undefined) {
    return {
      kind: "loading",
      title: "Checking what’s available…",
      detail: "Your next experience options are loading.",
      buttonLabel: "Please wait",
      accessibilityLabel: "Loading available experiences",
      icon: "clock",
    };
  }
  if (input.experiencesError && input.availableExperienceCount === undefined) {
    return {
      kind: "error",
      title: "Available experiences couldn’t load",
      detail: "Retry to check what you can join.",
      buttonLabel: "Retry",
      accessibilityLabel: "Retry loading available experiences",
      icon: "alert-circle",
    };
  }
  if (input.availableExperienceCount === 0) {
    return {
      kind: "no-availability",
      title: "No open experiences right now",
      detail: "Check back soon for new ways to contribute.",
      buttonLabel: "Browse experiences",
      accessibilityLabel: "Browse all experiences",
      icon: "compass",
    };
  }

  const hasHistory = participations.length > 0;
  return {
    kind: "discover",
    title: hasHistory ? "Find your next experience" : "Ready for your first experience?",
    detail: "Find an experience you’ll look forward to.",
    buttonLabel: "Explore experiences",
    accessibilityLabel: hasHistory ? "Explore your next experience" : "Explore your first experience",
    icon: "compass",
  };
}

export type OrganisationHomeExperience = {
  id: number;
  title: string;
  date: string;
  status: string;
};

export type OrganisationHomeFund = {
  id: number;
  title: string;
  goalSol: number;
  raisedSol: string;
  status: "active" | "closed";
};

export type OrganisationHomePriority = {
  kind:
    | "loading"
    | "error"
    | "reviews"
    | "experience"
    | "create-experience"
    | "campaign"
    | "create-campaign"
    | "manage";
  action: "retry-overview" | "retry-experiences" | "retry-funds" | "host" | "experience" | "create" | "funds" | "campaign";
  title: string;
  detail: string;
  buttonLabel: string;
  icon: "clock" | "alert-circle" | "clipboard" | "calendar" | "plus-circle" | "bar-chart-2" | "briefcase";
  experienceId?: number;
  fundId?: number;
};

export type OrganisationHomePriorityInput = {
  overviewLoading?: boolean;
  overviewError?: boolean;
  pendingReviews?: number;
  totalExperiences?: number;
  experiences?: OrganisationHomeExperience[];
  experiencesLoading?: boolean;
  experiencesError?: boolean;
  isCharity: boolean;
  funds?: OrganisationHomeFund[];
  fundsLoading?: boolean;
  fundsError?: boolean;
  now?: number;
};

export function selectOrganisationHomePriority(
  input: OrganisationHomePriorityInput,
): OrganisationHomePriority {
  const now = input.now ?? Date.now();
  if (input.overviewLoading && input.pendingReviews === undefined) {
    return {
      kind: "loading",
      action: "retry-overview",
      title: "Checking organisation activity…",
      detail: "Your current tasks are loading.",
      buttonLabel: "Please wait",
      icon: "clock",
    };
  }
  if (input.overviewError) {
    return {
      kind: "error",
      action: "retry-overview",
      title: "Organisation tasks couldn’t load",
      detail: "Retry to check reviews and hosted experiences.",
      buttonLabel: "Retry",
      icon: "alert-circle",
    };
  }
  if ((input.pendingReviews ?? 0) > 0) {
    const count = input.pendingReviews!;
    return {
      kind: "reviews",
      action: "host",
      title: "Participant submissions need review",
      detail: `${count} completion or milestone ${count === 1 ? "review is" : "reviews are"} awaiting your decision.`,
      buttonLabel: "Review submissions",
      icon: "clipboard",
    };
  }
  if (input.experiencesError) {
    return {
      kind: "error",
      action: "retry-experiences",
      title: "Hosted experiences couldn’t load",
      detail: "Retry to check event dates and participant activity.",
      buttonLabel: "Retry",
      icon: "alert-circle",
    };
  }
  if (!input.experiences && input.experiencesLoading) {
    return {
      kind: "loading",
      action: "retry-experiences",
      title: "Checking hosted experiences…",
      detail: "Your next organisation task is loading.",
      buttonLabel: "Please wait",
      icon: "clock",
    };
  }

  const experiences = input.experiences ?? [];
  const nextExperience = experiences
    .filter((item) => ["published", "full"].includes(item.status))
    .filter((item) => {
      const startsAt = new Date(`${item.date}T23:59:59`).getTime();
      return Number.isFinite(startsAt) && startsAt >= now;
    })
    .sort((left, right) => left.date.localeCompare(right.date))[0];
  if (nextExperience) {
    return {
      kind: "experience",
      action: "experience",
      title: "Prepare for your next experience",
      detail: `${nextExperience.title} is scheduled for ${nextExperience.date}.`,
      buttonLabel: "Manage experience",
      icon: "calendar",
      experienceId: nextExperience.id,
    };
  }

  if (input.totalExperiences === 0) {
    return {
      kind: "create-experience",
      action: "create",
      title: "Create your first experience",
      detail: "Set up a clear, useful way for participants to contribute.",
      buttonLabel: "Create experience",
      icon: "plus-circle",
    };
  }

  if (input.isCharity) {
    if (input.fundsError) {
      return {
        kind: "error",
        action: "retry-funds",
        title: "Fundraising activity couldn’t load",
        detail: "Retry to check your campaign status.",
        buttonLabel: "Retry",
        icon: "alert-circle",
      };
    }
    if (!input.funds && input.fundsLoading) {
      return {
        kind: "loading",
        action: "retry-funds",
        title: "Checking fundraising activity…",
        detail: "Campaign details are loading.",
        buttonLabel: "Please wait",
        icon: "clock",
      };
    }
    const activeFund = (input.funds ?? []).find((item) => item.status === "active");
    if (activeFund) {
      return {
        kind: "campaign",
        action: "campaign",
        title: "Review your active campaign",
        detail: `${activeFund.title} · campaign-linked contributions ${activeFund.raisedSol} of ${activeFund.goalSol} SOL.`,
        buttonLabel: "Open campaign tracker",
        icon: "bar-chart-2",
        fundId: activeFund.id,
      };
    }
    return {
      kind: "create-campaign",
      action: "funds",
      title: "Set up a charity campaign",
      detail: "Create a campaign with a clear goal and transparent contribution tracking.",
      buttonLabel: "Manage fundraising",
      icon: "bar-chart-2",
    };
  }

  if ((input.totalExperiences ?? 0) > 0) {
    return {
      kind: "manage",
      action: "host",
      title: "Review your hosted activity",
      detail: "Check past experiences and plan what your organisation will do next.",
      buttonLabel: "Open organisation activity",
      icon: "briefcase",
    };
  }

  return {
    kind: "create-experience",
    action: "create",
    title: "Create your first experience",
    detail: "Set up a clear, useful way for participants to contribute.",
    buttonLabel: "Create experience",
    icon: "plus-circle",
  };
}
