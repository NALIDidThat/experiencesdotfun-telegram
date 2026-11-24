const EXPERIENCE_XP_LEVELS = [
  { minimumXp: 0, label: "Explorer" },
  { minimumXp: 250, label: "Pathfinder" },
  { minimumXp: 500, label: "Trailblazer" },
  { minimumXp: 1_000, label: "Pioneer" },
  { minimumXp: 1_500, label: "Innovator" },
  { minimumXp: 2_500, label: "Architect" },
  { minimumXp: 5_000, label: "Visionary" },
  { minimumXp: 7_500, label: "Luminary" },
  { minimumXp: 10_000, label: "Vanguard" },
  { minimumXp: 15_000, label: "Legacy Builder" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function getExperienceXpProgress(xp) {
  const normalizedXp = Number.isFinite(xp)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(xp)))
    : 0;
  const currentIndex = EXPERIENCE_XP_LEVELS.reduce(
    (selected, level, index) => (normalizedXp >= level.minimumXp ? index : selected),
    0,
  );
  const current = EXPERIENCE_XP_LEVELS[currentIndex];
  const next = EXPERIENCE_XP_LEVELS[currentIndex + 1] ?? null;

  return {
    level: current.label,
    levelProgress: next
      ? Math.max(
          0,
          Math.min(
            99,
            Math.floor(
              ((normalizedXp - current.minimumXp) /
                (next.minimumXp - current.minimumXp)) *
                100,
            ),
          ),
        )
      : 100,
    nextLevelXp: next?.minimumXp ?? null,
    xpToNextLevel: next ? Math.max(0, next.minimumXp - normalizedXp) : null,
  };
}

function utcDate(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function utcDayNumber(dateString) {
  return Math.floor(Date.parse(`${dateString}T00:00:00.000Z`) / DAY_MS);
}

function eligibleUniqueEvents(events) {
  const seenSources = new Set();
  return events.filter((event) => {
    if (event.status !== "verified" || !utcDate(event.verifiedAt)) return false;
    if (event.sourceId === undefined || event.sourceId === null) return true;
    const sourceId = String(event.sourceId);
    if (seenSources.has(sourceId)) return false;
    seenSources.add(sourceId);
    return true;
  });
}

export function buildVerifiedProgression({
  balanceXp,
  pendingXp,
  verifiedExperiences,
  verifiedMilestones,
  now = new Date(),
}) {
  const eligibleExperiences = eligibleUniqueEvents(verifiedExperiences);
  const eligibleMilestones = eligibleUniqueEvents(verifiedMilestones);
  const experienceCount = eligibleExperiences.length;
  const milestoneCount = eligibleMilestones.length;
  const verifiedEvents = [
    ...eligibleExperiences.map((event) => ({ kind: "experience", verifiedAt: event.verifiedAt })),
    ...eligibleMilestones.map((event) => ({ kind: "milestone", verifiedAt: event.verifiedAt })),
  ];
  const verifiedDates = [...new Set(
    verifiedEvents
      .map((event) => utcDate(event.verifiedAt))
      .filter(Boolean),
  )].sort();
  const today = utcDate(now) ?? new Date().toISOString().slice(0, 10);
  let longestStreakDays = 0;
  let streakDays = 0;
  let previousDay = null;

  for (const date of verifiedDates) {
    const day = utcDayNumber(date);
    streakDays = previousDay !== null && day === previousDay + 1 ? streakDays + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, streakDays);
    previousDay = day;
  }

  const lastVerifiedUtcDate = verifiedDates.at(-1) ?? null;
  const currentStreakDays = lastVerifiedUtcDate
    && utcDayNumber(today) - utcDayNumber(lastVerifiedUtcDate) <= 1
    ? streakDays
    : 0;
  const verifiedContributionCount = experienceCount + milestoneCount;
  const missions = [
    {
      id: "first-verified-experience",
      title: "Complete your first experience",
      description: "Take part in an experience and have your completion verified.",
      progress: Math.min(experienceCount, 1),
      target: 1,
      status: experienceCount > 0 ? "completed" : "active",
    },
    {
      id: "verified-contributions",
      title: "Complete three verified contributions",
      description: "Verified experiences and milestones both count.",
      progress: Math.min(verifiedContributionCount, 3),
      target: 3,
      status: verifiedContributionCount >= 3 ? "completed" : "active",
    },
    {
      id: "three-day-streak",
      title: "Build a three-day streak",
      description: "Have a contribution verified on three consecutive UTC dates.",
      progress: Math.min(longestStreakDays, 3),
      target: 3,
      status: longestStreakDays >= 3 ? "completed" : "active",
    },
  ];
  const achievements = [
    {
      id: "first-contribution",
      title: "First contribution",
      description: "Your first meaningful activity was verified.",
      progress: Math.min(verifiedContributionCount, 1),
      target: 1,
      unlocked: verifiedContributionCount >= 1,
    },
    {
      id: "five-contributions",
      title: "Making a difference",
      description: "Five meaningful activities were verified.",
      progress: Math.min(verifiedContributionCount, 5),
      target: 5,
      unlocked: verifiedContributionCount >= 5,
    },
    {
      id: "week-streak",
      title: "A week of impact",
      description: "Build a seven-day streak of verified activity.",
      progress: Math.min(longestStreakDays, 7),
      target: 7,
      unlocked: longestStreakDays >= 7,
    },
  ];

  return {
    balanceXp,
    pendingXp,
    ...getExperienceXpProgress(balanceXp),
    streak: {
      currentDays: currentStreakDays,
      longestDays: longestStreakDays,
      lastVerifiedUtcDate,
      timezone: "UTC",
    },
    missions,
    achievements,
    nextAction: pendingXp > 0
      ? { kind: "redeem_xp", label: `Redeem ${pendingXp.toLocaleString()} pending XP` }
      : { kind: "explore_experiences", label: "Find an experience to join" },
    rules: {
      eligibleActivity: "Only a verified experience completion or verified milestone counts.",
      streakDate: "The UTC date when the host verifies the activity is used.",
      lateVerification: "A late verification counts on its verification date, not its submission or attendance date.",
      reset: "A streak is current through the next UTC date; it resets after a full UTC date without verification.",
      excludedActivity: "App opens, sign-ins, attendance marks, submissions, and rejected activity do not count.",
    },
  };
}
