import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  aiAssistantMessagesTable,
  experienceChallengesTable,
  experiencesTable,
  friendshipsTable,
  participationsTable,
  usersTable,
  type AiAssistantAction,
  type User,
} from "@workspace/db/schema";
import { experienceResponse } from "./data";
import { canCreateExperienceChallenge } from "./challenge-rules.mjs";
import { randomUUID } from "node:crypto";

export const aiAssistantTools = [
  {
    type: "function",
    function: {
      name: "search_experiences",
      description: "Find published volunteering experiences that match the user's request.",
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
  user: User,
  toolCall: ToolCall,
): Promise<{ result: unknown; actions: AiAssistantAction[] }> {
  const args = parseArguments(toolCall.arguments);
  let result: unknown;
  switch (toolCall.name) {
    case "search_experiences":
      result = await searchExperiences(args);
      break;
    case "list_friends":
      result = await listFriends(user.id, args);
      break;
    case "propose_join_experience":
      result = await proposeJoin(user, args);
      break;
    case "propose_challenge_friend":
      result = await proposeChallenge(user, args);
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
  return { result, actions: action ? [action] : [] };
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