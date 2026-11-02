import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  aiAssistantMessagesTable,
  experienceChallengesTable,
  experiencesTable,
  friendshipsTable,
  organisationsTable,
  participationsTable,
  xpAwardsTable,
  usersTable,
  type AiResearchSource,
  type AiAssistantAction,
  type AiExperienceDraft,
  type User,
} from "@workspace/db/schema";
import { experienceResponse } from "./data";
import { canCreateExperienceChallenge } from "./challenge-rules.mjs";
import { runWebSearchTool, webSearchTool } from "./ai-web-search";
import { randomUUID } from "node:crypto";

export const aiAssistantTools = [
  webSearchTool,
  {
    type: "function",
    function: {
      name: "search_experiences",
      description: "Find published real-world experiences in Experiences.fun that match the user's request.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          city: { type: "string" },
          category: {
            type: "string",
            enum: ["all", "environmental", "education", "community"],
          },
          availableOnly: { type: "boolean" },
        },
        required: ["query", "city", "category", "availableOnly"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_friends",
      description: "List the user's accepted Participant friends for a possible challenge.",
      strict: true,
      parameters: {
        type: "object",
        properties: { search: { type: "string" } },
        required: ["search"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_join_experience",
      description:
        "Prepare a join-experience action only when the user wants to join. This does not join the experience; the user must review and confirm, and a full experience may result in a waitlist place.",
      strict: true,
      parameters: {
        type: "object",
        properties: { experienceId: { type: "integer" } },
        required: ["experienceId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_challenge_friend",
      description:
        "Prepare a challenge action for an accepted Participant friend. This does not send the challenge; the user must confirm it.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          experienceId: { type: "integer" },
          friendId: { type: "integer" },
        },
        required: ["experienceId", "friendId"],
        additionalProperties: false,
      },
    },
  },
] satisfies ChatCompletionTool[];

const journeyTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_my_journey",
    description:
      "Summarise the signed-in participant's own experience participation history and XP awards. Use this for questions about what they have done, joined, completed, or earned.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
};

const hostedExperiencesTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_my_hosted_experiences",
    description:
      "List experiences created by the signed-in organisation, including their dates and status.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
};

const createDraftTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "prepare_experience_draft",
    description:
      "Prepare a reviewable experience draft for an organisation. Never publish it. Ask for missing title, description, category, date, start/end time, city, or meeting point before calling. Capacity and XP may use the suggested defaults of 12 and 150 when the user has no preference.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: {
          type: "string",
          enum: ["environmental", "education", "community"],
        },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "24-hour HH:MM" },
        endTime: { type: "string", description: "24-hour HH:MM" },
        city: { type: "string" },
        location: { type: "string", description: "Venue or meeting point" },
        capacity: { type: "integer" },
        xpReward: { type: "integer" },
        whatYouWillDo: { type: "string" },
        whatToBring: { type: "string" },
      },
      required: [
        "title",
        "description",
        "category",
        "date",
        "startTime",
        "endTime",
        "city",
        "location",
        "capacity",
        "xpReward",
        "whatYouWillDo",
        "whatToBring",
      ],
      additionalProperties: false,
    },
  },
};

export function getAiAssistantTools(user: User | null): ChatCompletionTool[] {
  const publicToolNames = new Set(["search_web", "search_experiences"]);
  const participantToolNames = new Set([
    ...publicToolNames,
    "list_friends",
    "propose_join_experience",
    "propose_challenge_friend",
  ]);
  const allowedToolNames = user?.userType === "participant"
    ? participantToolNames
    : publicToolNames;
  const tools: ChatCompletionTool[] = aiAssistantTools.filter((tool) =>
    tool.type === "function" && allowedToolNames.has(tool.function.name),
  );
  if (user?.userType === "participant") {
    tools.push(journeyTool);
  }
  if (user?.userType === "organisation") {
    tools.push(hostedExperiencesTool, createDraftTool);
  }
  return tools;
}

const searchInput = z.object({
  query: z.string().max(120),
  city: z.string().max(80),
  category: z.enum(["all", "environmental", "education", "community"]),
  availableOnly: z.boolean(),
});
const friendSearchInput = z.object({ search: z.string().max(80) });
const experienceInput = z.object({ experienceId: z.number().int().positive() });
const challengeInput = z.object({
  experienceId: z.number().int().positive(),
  friendId: z.number().int().positive(),
});
const noArgumentsInput = z.object({}).strict();
const experienceDraftInput = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(500),
  category: z.enum(["environmental", "education", "community"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  city: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(140),
  capacity: z.number().int().min(1).max(500),
  xpReward: z.number().int().min(0).max(1000),
  whatYouWillDo: z.string().max(300),
  whatToBring: z.string().max(200),
});

type ToolCall = { name: string; arguments: string };

function actionForExperience(experience: {
  id: number;
  title: string;
  date: string;
  city: string;
}, type: "view_experience" | "join_experience" = "view_experience"): AiAssistantAction {
  const common = {
    id: randomUUID(),
    experienceId: experience.id,
    experienceTitle: experience.title,
    experienceDate: experience.date,
    experienceCity: experience.city,
    friendId: null,
    friendName: null,
  };
  return type === "join_experience"
    ? { ...common, type: "join_experience", label: "Review and join" }
    : { ...common, type: "view_experience", label: "View experience" };
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getMyJourney(user: User, args: unknown) {
  if (!noArgumentsInput.safeParse(args).success) {
    return { error: "The journey request was invalid." };
  }
  const [
    participations,
    awards,
    [experienceCount],
    [joinedExperienceCount],
    [verifiedCompletions],
    [xpAwardCount],
  ] = await Promise.all([
    db
      .select({
        title: experiencesTable.title,
        date: experiencesTable.date,
        city: experiencesTable.city,
        status: participationsTable.status,
        joinedAt: participationsTable.joinedAt,
        completionStatement: participationsTable.completionStatement,
        verifiedAt: participationsTable.verifiedAt,
      })
      .from(participationsTable)
      .innerJoin(
        experiencesTable,
        eq(experiencesTable.id, participationsTable.experienceId),
      )
      .where(eq(participationsTable.userId, user.id))
      .orderBy(desc(participationsTable.joinedAt))
      .limit(20),
    db
      .select({
        title: xpAwardsTable.sourceTitle,
        amount: xpAwardsTable.amount,
        status: xpAwardsTable.status,
        awardedAt: xpAwardsTable.awardedAt,
      })
      .from(xpAwardsTable)
      .where(eq(xpAwardsTable.userId, user.id))
      .orderBy(desc(xpAwardsTable.awardedAt))
      .limit(15),
    db
      .select({ count: count() })
      .from(participationsTable)
      .where(eq(participationsTable.userId, user.id)),
    db
      .select({ count: count() })
      .from(participationsTable)
      .where(and(
        eq(participationsTable.userId, user.id),
        inArray(participationsTable.status, ["joined", "attended", "submitted", "verified", "rejected"]),
      )),
    db
      .select({ count: count() })
      .from(participationsTable)
      .where(and(
        eq(participationsTable.userId, user.id),
        eq(participationsTable.status, "verified"),
      )),
    db
      .select({ count: count() })
      .from(xpAwardsTable)
      .where(eq(xpAwardsTable.userId, user.id)),
  ]);
  return {
    currentXp: user.xp,
    participationRecordCount: experienceCount?.count ?? 0,
    joinedExperienceCount: joinedExperienceCount?.count ?? 0,
    verifiedCompletions: verifiedCompletions?.count ?? 0,
    returnedExperienceCount: participations.length,
    experienceHistoryTruncated: (experienceCount?.count ?? 0) > participations.length,
    xpAwardCount: xpAwardCount?.count ?? 0,
    xpHistoryTruncated: (xpAwardCount?.count ?? 0) > awards.length,
    experiences: participations.map((item) => ({
      title: item.title,
      date: item.date,
      city: item.city,
      status: item.status,
      joinedAt: item.joinedAt.toISOString(),
      completionStatement: item.completionStatement,
      verifiedAt: item.verifiedAt?.toISOString() ?? null,
    })),
    recentXpAwards: awards.map((item) => ({
      title: item.title,
      amount: item.amount,
      status: item.status,
      awardedAt: item.awardedAt.toISOString(),
    })),
  };
}

async function getMyHostedExperiences(user: User, args: unknown) {
  if (!noArgumentsInput.safeParse(args).success) {
    return { error: "The hosted experience request was invalid." };
  }
  const [rows, [totalCount]] = await Promise.all([
    db
      .select({
        title: experiencesTable.title,
        date: experiencesTable.date,
        city: experiencesTable.city,
        status: experiencesTable.status,
        capacity: experiencesTable.capacity,
      })
      .from(experiencesTable)
      .innerJoin(
        organisationsTable,
        eq(organisationsTable.id, experiencesTable.organisationId),
      )
      .where(eq(organisationsTable.ownerUserId, user.id))
      .orderBy(desc(experiencesTable.date))
      .limit(20),
    db
      .select({ count: count() })
      .from(experiencesTable)
      .innerJoin(
        organisationsTable,
        eq(organisationsTable.id, experiencesTable.organisationId),
      )
      .where(eq(organisationsTable.ownerUserId, user.id)),
  ]);
  return {
    experienceRecordCount: totalCount?.count ?? 0,
    returnedExperienceCount: rows.length,
    historyTruncated: (totalCount?.count ?? 0) > rows.length,
    experiences: rows,
  };
}

function prepareExperienceDraft(user: User, args: unknown) {
  if (user.userType !== "organisation") {
    return { error: "An organisation profile is required to prepare an experience draft." };
  }
  const parsed = experienceDraftInput.safeParse(args);
  if (!parsed.success) {
    return {
      error:
        "Check the required experience details. Dates must use YYYY-MM-DD and times must use 24-hour HH:MM.",
    };
  }
  const draft = parsed.data;
  const day = new Date(`${draft.date}T00:00:00.000Z`);
  if (
    Number.isNaN(day.getTime()) ||
    day.toISOString().slice(0, 10) !== draft.date ||
    draft.endTime <= draft.startTime
  ) {
    return { error: "The date or experience schedule is not valid." };
  }
  const action: AiAssistantAction = {
    id: randomUUID(),
    type: "draft_experience",
    experienceId: 0,
    experienceTitle: draft.title,
    experienceDate: draft.date,
    experienceCity: draft.city,
    label: "Review experience draft",
    friendId: null,
    friendName: null,
    draft: {
      ...draft,
      whatYouWillDo: draft.whatYouWillDo.trim() || null,
      whatToBring: draft.whatToBring.trim() || null,
    } satisfies AiExperienceDraft,
  };
  return {
    action,
    message:
      "A draft is ready for review. Nothing is saved or published yet; the organisation must review the details and publish from the existing creation flow.",
  };
}

async function searchExperiences(args: unknown) {
  const parsed = searchInput.safeParse(args);
  if (!parsed.success) return { error: "Search filters were invalid." };

  const filters = [inArray(experiencesTable.status, ["published", "full"])] as Parameters<
    typeof and
  >;
  if (parsed.data.category !== "all") {
    filters.push(eq(experiencesTable.category, parsed.data.category));
  }
  const query = parsed.data.query.trim();
  if (query) {
    const pattern = `%${query}%`;
    filters.push(
      or(
        ilike(experiencesTable.title, pattern),
        ilike(experiencesTable.description, pattern),
        ilike(experiencesTable.city, pattern),
      )!,
    );
  }
  const city = parsed.data.city.trim();
  if (city) filters.push(ilike(experiencesTable.city, `%${city}%`));

  const rows = await db
    .select()
    .from(experiencesTable)
    .where(and(...filters))
    .orderBy(asc(experiencesTable.date))
    .limit(20);
  const details = await Promise.all(rows.map((row) => experienceResponse(row)));
  const matches = details
    .filter((experience) =>
      !parsed.data.availableOnly || experience.availablePlaces > 0,
    )
    .slice(0, 5);

  return {
    experiences: matches.map((experience) => ({
      id: experience.id,
      title: experience.title,
      description: experience.description.slice(0, 220),
      category: experience.category,
      date: experience.date,
      city: experience.city,
      availablePlaces: experience.availablePlaces,
      xpReward: experience.xpReward,
    })),
  };
}

async function listFriends(userId: number, args: unknown) {
  const parsed = friendSearchInput.safeParse(args);
  if (!parsed.success) return { error: "Friend search was invalid." };

  const filters = [
    eq(friendshipsTable.status, "accepted"),
    eq(usersTable.userType, "participant"),
  ] as Parameters<typeof and>;
  const search = parsed.data.search.trim();
  if (search) {
    const pattern = `%${search}%`;
    filters.push(
      or(ilike(usersTable.name, pattern), ilike(usersTable.username, pattern))!,
    );
  }
  const friends = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
    })
    .from(friendshipsTable)
    .innerJoin(
      usersTable,
      or(
        and(
          eq(friendshipsTable.requesterUserId, userId),
          eq(usersTable.id, friendshipsTable.recipientUserId),
        ),
        and(
          eq(friendshipsTable.recipientUserId, userId),
          eq(usersTable.id, friendshipsTable.requesterUserId),
        ),
      ),
    )
    .where(and(...filters))
    .orderBy(asc(usersTable.name))
    .limit(15);
  return { friends };
}

async function proposeJoin(user: User, args: unknown) {
  const parsed = experienceInput.safeParse(args);
  if (!parsed.success) return { error: "Experience selection was invalid." };
  const experience = await db.query.experiencesTable.findFirst({
    where: and(
      eq(experiencesTable.id, parsed.data.experienceId),
      inArray(experiencesTable.status, ["published", "full"]),
    ),
  });
  if (!experience) return { error: "That experience is not open for participation." };

  const participation = await db.query.participationsTable.findFirst({
    where: and(
      eq(participationsTable.experienceId, experience.id),
      eq(participationsTable.userId, user.id),
    ),
  });
  if (participation) {
    return {
      error:
        participation.status === "waitlisted"
          ? "The user is already on this experience's waitlist."
          : "The user already has a participation record for this experience.",
    };
  }
  return {
    action: actionForExperience(experience, "join_experience"),
    message:
      "The user must review this action and explicitly confirm before joining. The user may be placed on a waitlist if the experience fills up.",
  };
}

async function proposeChallenge(user: User, args: unknown) {
  const parsed = challengeInput.safeParse(args);
  if (!parsed.success) return { error: "Challenge selection was invalid." };

  const [friend, experience, friendship] = await Promise.all([
    db.query.usersTable.findFirst({
      where: eq(usersTable.id, parsed.data.friendId),
    }),
    db.query.experiencesTable.findFirst({
      where: eq(experiencesTable.id, parsed.data.experienceId),
    }),
    db.query.friendshipsTable.findFirst({
      where: and(
        eq(friendshipsTable.status, "accepted"),
        or(
          and(
            eq(friendshipsTable.requesterUserId, user.id),
            eq(friendshipsTable.recipientUserId, parsed.data.friendId),
          ),
          and(
            eq(friendshipsTable.requesterUserId, parsed.data.friendId),
            eq(friendshipsTable.recipientUserId, user.id),
          ),
        ),
      ),
    }),
  ]);
  if (!friend || !experience) return { error: "That friend or experience could not be found." };
  if (
    !canCreateExperienceChallenge({
      challengerId: user.id,
      friendId: friend.id,
      friendshipStatus: friendship?.status,
      challengerType: user.userType,
      friendType: friend.userType,
      experienceStatus: experience.status,
    })
  ) {
    return { error: "Only accepted Participant friends can be challenged to an open experience." };
  }

  const existing = await db.query.experienceChallengesTable.findFirst({
    where: and(
      eq(experienceChallengesTable.experienceId, experience.id),
      inArray(experienceChallengesTable.status, ["pending", "accepted"]),
      or(
        and(
          eq(experienceChallengesTable.challengerUserId, user.id),
          eq(experienceChallengesTable.challengedUserId, friend.id),
        ),
        and(
          eq(experienceChallengesTable.challengerUserId, friend.id),
          eq(experienceChallengesTable.challengedUserId, user.id),
        ),
      ),
    ),
  });
  if (existing) return { error: "There is already an active challenge for this experience." };

  const action: AiAssistantAction = {
    id: randomUUID(),
    type: "challenge_friend",
    experienceId: experience.id,
    experienceTitle: experience.title,
    experienceDate: experience.date,
    experienceCity: experience.city,
    label: `Challenge ${friend.name}`,
    friendId: friend.id,
    friendName: friend.name,
  };
  return {
    action,
    message: "The user must confirm before the challenge is sent.",
  };
}

export async function executeAiAssistantTool(
  user: User | null,
  toolCall: ToolCall,
): Promise<{
  result: unknown;
  actions: AiAssistantAction[];
  sources: AiResearchSource[];
}> {
  const args = parseArguments(toolCall.arguments);
  let result: unknown;
  const actions: AiAssistantAction[] = [];
  let sources: AiResearchSource[] = [];
  switch (toolCall.name) {
    case "search_web": {
      const search = await runWebSearchTool(toolCall.arguments);
      result = search.result;
      sources = search.sources;
      break;
    }
    case "search_experiences": {
      const searchResult = await searchExperiences(args);
      result = searchResult;
      if ("experiences" in searchResult && Array.isArray(searchResult.experiences)) {
        for (const experience of searchResult.experiences) {
          actions.push(actionForExperience(experience));
        }
      }
      break;
    }
    case "get_my_journey":
      result = user?.userType === "participant"
        ? await getMyJourney(user, args)
        : { error: "A signed-in Participant profile is required for personal journey details." };
      break;
    case "get_my_hosted_experiences":
      result = user?.userType === "organisation"
        ? await getMyHostedExperiences(user, args)
        : { error: "A signed-in Organisation profile is required." };
      break;
    case "prepare_experience_draft":
      result = user
        ? prepareExperienceDraft(user, args)
        : { error: "An organisation profile is required to prepare an experience draft." };
      break;
    case "list_friends":
      result = user?.userType === "participant"
        ? await listFriends(user.id, args)
        : { error: "A signed-in Participant profile is required." };
      break;
    case "propose_join_experience":
      result = user?.userType === "participant"
        ? await proposeJoin(user, args)
        : { error: "A signed-in Participant profile is required." };
      break;
    case "propose_challenge_friend":
      result = user?.userType === "participant"
        ? await proposeChallenge(user, args)
        : { error: "A signed-in Participant profile is required." };
      break;
    default:
      result = { error: "That assistant action is not available." };
  }

  const action =
    typeof result === "object" &&
    result !== null &&
    "action" in result &&
    typeof result.action === "object" &&
    result.action !== null
      ? (result.action as AiAssistantAction)
      : null;
  if (action && !actions.some((existing) => existing.id === action.id)) {
    actions.push(action);
  }
  return { result, actions, sources };
}

export async function saveAssistantMessage(
  conversationId: number,
  content: string,
  actions: AiAssistantAction[],
) {
  return db
    .insert(aiAssistantMessagesTable)
    .values({ conversationId, role: "assistant", content, actions })
    .returning();
}