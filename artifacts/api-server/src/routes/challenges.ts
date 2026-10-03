import { and, desc, eq, or } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { CreateExperienceChallengeBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  experienceChallengesTable,
  experiencesTable,
  friendshipsTable,
  participationsTable,
  usersTable,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  acceptedChallengeStatus,
  canCreateExperienceChallenge,
} from "../lib/challenge-rules.mjs";

const router: IRouter = Router();
router.use(requireTelegramUser);

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function participantSummary(user: {
  id: number;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

async function challengeResponse(challengeId: number, viewerId: number) {
  const row = await db
    .select({
      challenge: experienceChallengesTable,
      experience: experiencesTable,
      challenger: usersTable,
    })
    .from(experienceChallengesTable)
    .innerJoin(
      experiencesTable,
      eq(experiencesTable.id, experienceChallengesTable.experienceId),
    )
    .innerJoin(
      usersTable,
      eq(usersTable.id, experienceChallengesTable.challengerUserId),
    )
    .where(eq(experienceChallengesTable.id, challengeId))
    .limit(1);
  const details = row[0];
  if (!details) return null;
  const challenged = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, details.challenge.challengedUserId),
  });
  if (!challenged) return null;
  return {
    id: details.challenge.id,
    experienceId: details.experience.id,
    experienceTitle: details.experience.title,
    experienceDate: details.experience.date,
    experienceCity: details.experience.city,
    challenger: participantSummary(details.challenger),
    challenged: participantSummary(challenged),
    status: details.challenge.status,
    direction:
      details.challenge.challengedUserId === viewerId ? "incoming" : "outgoing",
    createdAt: details.challenge.createdAt,
    acceptedAt: details.challenge.acceptedAt,
    completedAt: details.challenge.completedAt,
  };
}

function isParticipantAccount(user: ReturnType<typeof currentUser>, res: Response) {
  if (user.userType === "participant") return true;
  sendError(
    res,
    user.userType === null ? 409 : 403,
    user.userType === null
      ? "Choose a Participant account before using challenges."
      : "Challenges are available to Participant accounts only.",
  );
  return false;
}

router.get("/", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipantAccount(user, res)) return;

  const rows = await db
    .select({
      challenge: experienceChallengesTable,
      experience: experiencesTable,
      otherUser: usersTable,
    })
    .from(experienceChallengesTable)
    .innerJoin(
      experiencesTable,
      eq(experiencesTable.id, experienceChallengesTable.experienceId),
    )
    .innerJoin(
      usersTable,
      or(
        and(
          eq(experienceChallengesTable.challengerUserId, user.id),
          eq(usersTable.id, experienceChallengesTable.challengedUserId),
        ),
        and(
          eq(experienceChallengesTable.challengedUserId, user.id),
          eq(usersTable.id, experienceChallengesTable.challengerUserId),
        ),
      ),
    )
    .where(
      or(
        eq(experienceChallengesTable.challengerUserId, user.id),
        eq(experienceChallengesTable.challengedUserId, user.id),
      ),
    )
    .orderBy(desc(experienceChallengesTable.createdAt))
    .limit(100);

  res.json(
    rows.map(({ challenge, experience, otherUser }) => {
      const viewerIsChallenger = challenge.challengerUserId === user.id;
      return {
        id: challenge.id,
        experienceId: experience.id,
        experienceTitle: experience.title,
        experienceDate: experience.date,
        experienceCity: experience.city,
        challenger: viewerIsChallenger
          ? participantSummary(user)
          : participantSummary(otherUser),
        challenged: viewerIsChallenger
          ? participantSummary(otherUser)
          : participantSummary(user),
        status: challenge.status,
        direction: viewerIsChallenger ? "outgoing" : "incoming",
        createdAt: challenge.createdAt,
        acceptedAt: challenge.acceptedAt,
        completedAt: challenge.completedAt,
      };
    }),
  );
});

router.post("/", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipantAccount(user, res)) return;

  const parsed = CreateExperienceChallengeBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Choose an experience and an accepted friend.");
    return;
  }
  const { experienceId, friendId } = parsed.data;
  if (friendId === user.id) {
    sendError(res, 400, "You cannot challenge yourself.");
    return;
  }

  const [friend, experience, friendship] = await Promise.all([
    db.query.usersTable.findFirst({ where: eq(usersTable.id, friendId) }),
    db.query.experiencesTable.findFirst({
      where: eq(experiencesTable.id, experienceId),
    }),
    db.query.friendshipsTable.findFirst({
      where: and(
        eq(friendshipsTable.status, "accepted"),
        or(
          and(
            eq(friendshipsTable.requesterUserId, user.id),
            eq(friendshipsTable.recipientUserId, friendId),
          ),
          and(
            eq(friendshipsTable.requesterUserId, friendId),
            eq(friendshipsTable.recipientUserId, user.id),
          ),
        ),
      ),
    }),
  ]);

  if (!friend || !experience) {
    sendError(res, 404, "That friend or experience could not be found.");
    return;
  }
  if (
    !canCreateExperienceChallenge({
      challengerId: user.id,
      friendId,
      friendshipStatus: friendship?.status,
      challengerType: user.userType,
      friendType: friend.userType,
      experienceStatus: experience.status,
    })
  ) {
    sendError(
      res,
      409,
      "Challenges require an accepted Participant friend and an open experience.",
    );
    return;
  }

  try {
    const [created] = await db
      .insert(experienceChallengesTable)
      .values({
        experienceId,
        challengerUserId: user.id,
        challengedUserId: friendId,
      })
      .returning({ id: experienceChallengesTable.id });
    const response = created
      ? await challengeResponse(created.id, user.id)
      : null;
    if (!response) {
      sendError(res, 500, "We couldn't create that challenge. Please try again.");
      return;
    }
    res.status(201).json(response);
  } catch (createError) {
    const code =
      typeof createError === "object" &&
      createError !== null &&
      "code" in createError
        ? String(createError.code)
        : "";
    if (code === "23505") {
      sendError(
        res,
        409,
        "There is already an active challenge for this experience between you.",
      );
      return;
    }
    throw createError;
  }
});

router.post("/:challengeId/accept", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipantAccount(user, res)) return;
  const challengeId = parseId(req.params.challengeId);
  if (!challengeId) {
    sendError(res, 400, "Invalid challenge.");
    return;
  }

  const challenge = await db.query.experienceChallengesTable.findFirst({
    where: and(
      eq(experienceChallengesTable.id, challengeId),
      eq(experienceChallengesTable.challengedUserId, user.id),
    ),
  });
  if (!challenge) {
    sendError(res, 404, "Challenge not found.");
    return;
  }
  const participation = await db.query.participationsTable.findFirst({
    where: and(
      eq(participationsTable.experienceId, challenge.experienceId),
      eq(participationsTable.userId, user.id),
    ),
  });
  const nextStatus = acceptedChallengeStatus(
    challenge.status,
    participation?.status === "verified",
  );
  if (!nextStatus) {
    sendError(res, 409, "This challenge is no longer waiting for your response.");
    return;
  }

  const acceptedAt = new Date();
  const [updated] = await db
    .update(experienceChallengesTable)
    .set({
      status: nextStatus,
      acceptedAt,
      ...(nextStatus === "completed" ? { completedAt: acceptedAt } : {}),
    })
    .where(
      and(
        eq(experienceChallengesTable.id, challengeId),
        eq(experienceChallengesTable.challengedUserId, user.id),
        eq(experienceChallengesTable.status, "pending"),
      ),
    )
    .returning({ id: experienceChallengesTable.id });
  if (!updated) {
    sendError(res, 409, "This challenge was updated. Refresh and try again.");
    return;
  }
  const response = await challengeResponse(challengeId, user.id);
  if (!response) {
    sendError(res, 404, "Challenge not found.");
    return;
  }
  res.json(response);
});

router.post("/:challengeId/decline", async (req, res) => {
  const user = currentUser(req);
  if (!isParticipantAccount(user, res)) return;
  const challengeId = parseId(req.params.challengeId);
  if (!challengeId) {
    sendError(res, 400, "Invalid challenge.");
    return;
  }

  const [updated] = await db
    .update(experienceChallengesTable)
    .set({ status: "declined" })
    .where(
      and(
        eq(experienceChallengesTable.id, challengeId),
        eq(experienceChallengesTable.challengedUserId, user.id),
        eq(experienceChallengesTable.status, "pending"),
      ),
    )
    .returning({ id: experienceChallengesTable.id });
  if (!updated) {
    const ownedChallenge = await db.query.experienceChallengesTable.findFirst({
      where: and(
        eq(experienceChallengesTable.id, challengeId),
        eq(experienceChallengesTable.challengedUserId, user.id),
      ),
      columns: { id: true },
    });
    sendError(
      res,
      ownedChallenge ? 409 : 404,
      ownedChallenge
        ? "This challenge is no longer waiting for your response."
        : "Challenge not found.",
    );
    return;
  }
  const response = await challengeResponse(challengeId, user.id);
  if (!response) {
    sendError(res, 404, "Challenge not found.");
    return;
  }
  res.json(response);
});

export default router;