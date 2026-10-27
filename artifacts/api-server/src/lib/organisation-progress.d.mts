export type OrganisationProgressMilestoneId =
  | "profile_ready"
  | "first_experience"
  | "first_verified_delivery"
  | "repeat_participation";

export type OrganisationProgressNextAction =
  | "edit_profile"
  | "create_experience"
  | "manage_experiences";

export type OrganisationProgress = {
  milestones: Array<{
    id: OrganisationProgressMilestoneId;
    completed: boolean;
  }>;
  currentMilestoneId: OrganisationProgressMilestoneId | null;
  nextAction: OrganisationProgressNextAction;
};

export function getOrganisationProgress(input: {
  organisation: {
    id: number;
    name: string;
    description: string | null;
    city: string | null;
    organisationType: string | null;
    categories: string[];
  } | null;
  experiences: Array<{
    id: number;
    organisationId: number;
    status: string;
  }>;
  participations: Array<{
    experienceId: number;
    userId: number;
    status: string;
    verifiedAt: Date | string | null;
  }>;
}): OrganisationProgress;
