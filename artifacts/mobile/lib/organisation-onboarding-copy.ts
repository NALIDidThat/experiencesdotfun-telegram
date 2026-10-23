import type { OrganisationType } from "@workspace/api-client-react";

export type OrganisationOnboardingPageCopy = {
  headline: string;
  description: string;
};

export const organisationOnboardingCopy: Record<
  OrganisationType,
  readonly [OrganisationOnboardingPageCopy, OrganisationOnboardingPageCopy, OrganisationOnboardingPageCopy]
> = {
  charity: [
    {
      headline: "Turn your mission into action.",
      description: "Bring supporters together through local experiences built around your cause.",
    },
    {
      headline: "Make volunteering count.",
      description: "Host activities, manage participants and review completed contributions.",
    },
    {
      headline: "Track the difference you make.",
      description: "Follow participation and manage your organisation's activities. Eligible charity profiles can also access fundraising tools after review.",
    },
  ],
  nonprofit: [
    {
      headline: "Turn your mission into local action.",
      description: "Bring people together around the causes, skills and needs your organisation serves.",
    },
    {
      headline: "Give people a way to show up.",
      description: "Host community, education or environmental experiences and review participation.",
    },
    {
      headline: "Keep your work connected.",
      description: "Manage your organisation profile, hosted experiences and contribution progress in one place.",
    },
  ],
  school: [
    {
      headline: "Take learning beyond the classroom.",
      description: "Create experiences where learners practise skills and contribute to their local community.",
    },
    {
      headline: "Make participation visible.",
      description: "Host educational, environmental or community activities, then review attendance and completed contributions.",
    },
    {
      headline: "Recognise learning in action.",
      description: "Set XP rewards for experiences and review learner participation as they get involved.",
    },
  ],
  community_centre: [
    {
      headline: "Make your hub the meeting point.",
      description: "Bring neighbours together through local activities, shared interests and community causes.",
    },
    {
      headline: "Turn connection into participation.",
      description: "Create experiences, see who's joining and review completed contributions.",
    },
    {
      headline: "See your community in motion.",
      description: "Keep hosted experiences, participant activity and contribution progress organised in one place.",
    },
  ],
  library: [
    {
      headline: "Make your library a local connector.",
      description: "Help readers, learners and neighbours connect through experiences in your area.",
    },
    {
      headline: "Take learning beyond the shelves.",
      description: "Host educational and community activities, then review attendance and completed contributions.",
    },
    {
      headline: "Keep local learning visible.",
      description: "Organise your library's experiences and follow participation as your community gets involved.",
    },
  ],
  youth_organisation: [
    {
      headline: "Give young people a place to grow.",
      description: "Bring young people together through experiences shaped around their interests and community.",
    },
    {
      headline: "Turn energy into contribution.",
      description: "Host learning, creative or community activities and coordinate participation with the people who support them.",
    },
    {
      headline: "See every step forward.",
      description: "Keep your organisation's activities and participation progress connected in one place.",
    },
  ],
  business: [
    {
      headline: "Put your support into action.",
      description: "Support local causes by creating experiences or connecting with community organisations.",
    },
    {
      headline: "Show up where it matters.",
      description: "Create local experiences, build community partnerships and see who takes part.",
    },
    {
      headline: "Make local engagement tangible.",
      description: "Keep your organisation profile, hosted experiences and participation progress connected.",
    },
  ],
  other: [
    {
      headline: "Bring your organisation into action.",
      description: "Create meaningful experiences around the people and communities you serve.",
    },
    {
      headline: "Make it easy to take part.",
      description: "Host activities, coordinate participants and review completed contributions.",
    },
    {
      headline: "Keep your work moving.",
      description: "Manage your profile, hosted experiences and participation progress in one place.",
    },
  ],
};
