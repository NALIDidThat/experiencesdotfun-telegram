import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AcceptFriendRequestParams,
  CreateExperienceBody,
  CreateFriendRequestBody,
  GetExperienceParams,
  ListExperiencesQueryParams,
  ListExperienceParticipantsParams,
  ListMyParticipationsQueryParams,
  MarkAttendanceParams,
  RejectParticipationParams,
  SubmitCompletionParams,
  AuthenticateTelegramBody,
  SignUpWithEmailBody,
  LoginWithEmailBody,
  UpdateMeBody,
  VerifyParticipationParams,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  experiencesTable,
  friendshipsTable,
  organisationsTable,
  participationsTable,
  usersTable,
  type UserType,
} from "@workspace/db/schema";
import {
  currentUser,
  authenticateEmail,
  createEmailAccount,
  findUserByTelegramId,
  findUserByUsername,
  requireTelegramUser,
  upsertTelegramUser,
  verifyTelegramInitData,
} from "../lib/auth";
import { logger } from "../lib/logger";
import {
  currentOrganisation,
  experienceResponse,
  organisationResponse,
  participationResponse,
  userResponse,
} from "../lib/data";
import { escapeTelegramHtml, sendFriendRequestNotification, sendTelegramMessage } from "../lib/telegram";
import { createOrReopenFriendRequest } from "../lib/friends";

const router: IRouter = Router();

router.post("/auth/telegram", async (req, res) => {
  const parsed = AuthenticateTelegramBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Telegram login data is missing.");
    return;
  }

  let identity: ReturnType<typeof verifyTelegramInitData>;
  try {
    identity = verifyTelegramInitData(parsed.data.initData);
  } catch (authError) {
    const reason = authError instanceof Error ? authError.message : "";
    logger.warn({ err: authError }, "Telegram login rejected");
    if (reason === "TELEGRAM_BOT_TOKEN is not configured.") {
      error(res, 503, "Telegram sign-in is temporarily unavailable. Please use email or try again later.");
    } else if (reason.includes("expired")) {
      error(res, 401, "Your Telegram sign-in has expired. Close the Mini App and reopen it from the official bot.");
    } else {
      error(res, 401, "Telegram could not verify this sign-in. Close the Mini App and reopen it from the official bot.");
    }
    return;
  }

  try {
    const existing = await findUserByTelegramId(identity.id);
    const user = await upsertTelegramUser(identity);
    res.json({ user: await userResponse(user), isNew: !existing, sessionToken: null });
  } catch (accountError) {
    logger.error({ err: accountError }, "Telegram account initialization failed");
    error(res, 500, "Telegram was verified, but your profile could not be loaded. Please try again or use email.");
  }
});

router.post("/auth/email/signup", async (req, res) => {
  const parsed = SignUpWithEmailBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Enter a name, valid email address, and password of at least 8 characters.");
    return;
  }
  try {
    const result = await createEmailAccount(parsed.data);
    res.json({ user: await userResponse(result.user), isNew: true, sessionToken: result.sessionToken });
  } catch (signupError) {
    if (signupError instanceof Error && signupError.message === "EMAIL_ALREADY_REGISTERED") {
      error(res, 409, "That email is already registered. Log in instead.");
      return;
    }
    logger.error({ err: signupError }, "Email signup failed");
    error(res, 500, "We couldn't create your account. Please try again.");
  }
});

router.post("/auth/email/login", async (req, res) => {
  const parsed = LoginWithEmailBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Enter your email and password.");
    return;
  }
  const result = await authenticateEmail(parsed.data);
  if (!result) {
    error(res, 401, "That email or password is not correct.");
    return;
  }
  res.json({ user: await userResponse(result.user), isNew: false, sessionToken: result.sessionToken });
});

router.use(requireTelegramUser);

function error(res: Parameters<Parameters<IRouter["get"]>[1]>[1], status: number, message: string) {
  res.status(status).json({ message });
}

function enforceAccountType(req: Request, res: Response, expected: UserType): boolean {
  const userType = currentUser(req).userType;
  if (userType === expected) return true;
  if (userType === null) {
    res.status(409).json({
      code: "ACCOUNT_TYPE_REQUIRED",
      message: "Choose a Participant or Organisation account before continuing.",
    });
  } else {
    res.status(403).json({
      code: "ACCOUNT_TYPE_FORBIDDEN",
      message:
        expected === "organisation"
          ? "This action is available to Organisation accounts only."
          : "This action is available to Participant accounts only.",
    });
  }
  return false;
}

router.use("/host", (req, res, next) => {
  if (enforceAccountType(req, res, "organisation")) next();
});

router.get("/me", async (req, res) => {
  res.json(await userResponse(currentUser(req)));
});

router.patch("/me", async (req, res) => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Please check your profile details.");
    return;
  }
  const patch = parsed.data;
  const user = currentUser(req);
  if (patch.userType !== undefined && user.userType !== null && patch.userType !== user.userType) {
    res.status(409).json({
      code: "ACCOUNT_TYPE_LOCKED",
      message: "Account type cannot be changed after selection.",
    });
    return;
  }
  if (patch.organisation && (patch.userType ?? user.userType) !== "organisation") {
    res.status(403).json({
      code: "ACCOUNT_TYPE_FORBIDDEN",
      message: "Only Organisation accounts can update an organisation profile.",
    });
    return;
  }
  const updated = await db.transaction(async (transaction) => {
    const [updatedUser] = await transaction
      .update(usersTable)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
        ...(patch.participationType !== undefined
          ? { participationType: patch.participationType }
          : {}),
        ...(patch.userType !== undefined ? { userType: patch.userType } : {}),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id))
      .returning();

    if (patch.organisation) {
      const profile = patch.organisation;
      const existing = await transaction.query.organisationsTable.findFirst({
        where: eq(organisationsTable.ownerUserId, user.id),
        orderBy: desc(organisationsTable.createdAt),
      });
      const values = {
        name: profile.name.trim(),
        description: profile.description.trim(),
        city: profile.city.trim(),
        country: patch.country ?? user.country,
        categories: profile.categories,
      };
      if (existing) {
        await transaction
          .update(organisationsTable)
          .set(values)
          .where(eq(organisationsTable.id, existing.id));
      } else {
        await transaction
          .insert(organisationsTable)
          .values({ ownerUserId: user.id, ...values });
      }
    }
    return updatedUser;
  });
  res.json(await userResponse(updated ?? user));
});

router.get("/experiences", async (req, res) => {
  const parsed = ListExperiencesQueryParams.safeParse({
    category: typeof req.query.category === "string" ? req.query.category : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    availableOnly:
      typeof req.query.availableOnly === "string"
        ? req.query.availableOnly === "true"
        : undefined,
  });
  if (!parsed.success) {
    error(res, 400, "Invalid discovery filters.");
    return;
  }
  const filters = [inArray(experiencesTable.status, ["published", "full"])] as Parameters<
    typeof and
  >;
  if (parsed.data.category) {
    filters.push(eq(experiencesTable.category, parsed.data.category));
  }
  if (parsed.data.search) {
    const pattern = `%${parsed.data.search}%`;
    filters.push(
      or(
        ilike(experiencesTable.title, pattern),
        ilike(experiencesTable.description, pattern),
        ilike(experiencesTable.city, pattern),
      )!,
    );
  }
  const rows = await db
    .select()
    .from(experiencesTable)
    .where(and(...filters))
    .orderBy(experiencesTable.date, desc(experiencesTable.createdAt));
  const results = await Promise.all(rows.map((row) => experienceResponse(row)));
  res.json(parsed.data.availableOnly ? results.filter((item) => item.availablePlaces > 0) : results);
});

router.post("/experiences", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const parsed = CreateExperienceBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Please complete every experience field.");
    return;
  }
  const user = currentUser(req);
  const input = parsed.data;
  const existingOrganisation = await currentOrganisation(user.id);
  if (!existingOrganisation) {
    error(res, 409, "Complete your organisation profile before creating an experience.");
    return;
  }
  try {
    const created = await db.transaction(async (transaction) => {
      const [organisation] = await transaction
        .update(organisationsTable)
        .set({
          name: input.organisationName.trim(),
          description: input.organisationDescription?.trim() || existingOrganisation.description,
        })
        .where(eq(organisationsTable.id, existingOrganisation.id))
        .returning();
      if (!organisation) throw new Error("Organisation profile is missing.");

      const [createdExperience] = await transaction
        .insert(experiencesTable)
        .values({
          organisationId: organisation.id,
          title: input.title,
          description: input.description,
          category: input.category,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          location: input.location,
          city: input.city,
          capacity: input.capacity,
          xpReward: input.xpReward,
          monetaryRewardPence: input.monetaryRewardPence,
          whatToBring: input.whatToBring,
          whatYouWillDo: input.whatYouWillDo,
        })
        .returning();
      if (!createdExperience) throw new Error("Unable to create experience.");
      return createdExperience;
    });
    res.status(201).json(await experienceResponse(created));
  } catch (publishError) {
    logger.error({ err: publishError, userId: user.id }, "Experience publish failed");
    error(res, 500, "We couldn't publish this experience. Please try again.");
  }
});

router.get("/experiences/:experienceId", async (req, res) => {
  const parsed = GetExperienceParams.safeParse({
    experienceId: Number(req.params.experienceId),
  });
  if (!parsed.success) {
    error(res, 400, "Invalid experience.");
    return;
  }
  const experience = await db.query.experiencesTable.findFirst({
    where: eq(experiencesTable.id, parsed.data.experienceId),
  });
  if (!experience) {
    error(res, 404, "Experience not found.");
    return;
  }
  const user = currentUser(req);
  const participation = await db.query.participationsTable.findFirst({
    where: and(
      eq(participationsTable.experienceId, experience.id),
      eq(participationsTable.userId, user.id),
    ),
  });
  res.json({
    ...(await experienceResponse(experience)),
    whatToBring: experience.whatToBring,
    whatYouWillDo: experience.whatYouWillDo,
    joined: Boolean(participation),
    participation: participation ? await participationResponse(participation) : null,
  });
});

router.post("/experiences/:experienceId/join", async (req, res) => {
  if (!enforceAccountType(req, res, "participant")) return;
  const parsed = GetExperienceParams.safeParse({
    experienceId: Number(req.params.experienceId),
  });
  if (!parsed.success) {
    error(res, 400, "Invalid experience.");
    return;
  }
  const user = currentUser(req);
  const experience = await db.query.experiencesTable.findFirst({
    where: eq(experiencesTable.id, parsed.data.experienceId),
  });
  if (!experience) {
    error(res, 404, "Experience not found.");
    return;
  }
  const existing = await db.query.participationsTable.findFirst({
    where: and(
      eq(participationsTable.experienceId, experience.id),
      eq(participationsTable.userId, user.id),
    ),
  });
  if (existing) {
    error(res, 409, "You are already participating in this experience.");
    return;
  }
  const [participantCount] = await db
    .select({ value: count() })
    .from(participationsTable)
    .where(
      and(
        eq(participationsTable.experienceId, experience.id),
        inArray(participationsTable.status, ["joined", "attended", "submitted", "verified"]),
      ),
    );
  if (Number(participantCount?.value ?? 0) >= experience.capacity) {
    error(res, 409, "This experience is full.");
    return;
  }
  const [created] = await db
    .insert(participationsTable)
    .values({ experienceId: experience.id, userId: user.id })
    .returning();
  const organisation = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, experience.organisationId),
  });
  await sendTelegramMessage(
    user.telegramId,
    `<b>You're in</b>\n\nYou've joined <b>${escapeTelegramHtml(experience.title)}</b>.\n${escapeTelegramHtml(experience.date)} · ${escapeTelegramHtml(experience.city)}\n+${experience.xpReward} XP${experience.monetaryRewardPence ? ` · £${(experience.monetaryRewardPence / 100).toFixed(2)}` : ""}`,
    [[{ text: "View experience", web_app: { url: `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? process.env.REPLIT_DEV_DOMAIN}/?screen=experience&id=${experience.id}` } }]],
  );
  if (organisation) {
    const host = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, organisation.ownerUserId),
    });
    if (host && host.id !== user.id) {
      await sendTelegramMessage(host.telegramId, `<b>New participant</b>\n${escapeTelegramHtml(user.name)} joined <b>${escapeTelegramHtml(experience.title)}</b>.`);
    }
  }
  res.status(201).json(await participationResponse(created));
});

router.get("/participations", async (req, res) => {
  if (!enforceAccountType(req, res, "participant")) return;
  const parsed = ListMyParticipationsQueryParams.safeParse({
    status: typeof req.query.status === "string" ? req.query.status : undefined,
  });
  if (!parsed.success) {
    error(res, 400, "Invalid participation filter.");
    return;
  }
  const rows = await db
    .select()
    .from(participationsTable)
    .where(eq(participationsTable.userId, currentUser(req).id))
    .orderBy(desc(participationsTable.joinedAt));
  const results = await Promise.all(rows.map((row) => participationResponse(row)));
  res.json(
    parsed.data.status === "completed"
      ? results.filter((item) => ["verified", "rejected", "submitted"].includes(item.status))
      : parsed.data.status === "upcoming"
        ? results.filter((item) => ["joined", "attended"].includes(item.status))
        : results,
  );
});

router.post("/participations/:participationId/submit", async (req, res) => {
  if (!enforceAccountType(req, res, "participant")) return;
  const parsed = SubmitCompletionParams.safeParse({
    participationId: Number(req.params.participationId),
  });
  if (!parsed.success) {
    error(res, 400, "Invalid participation.");
    return;
  }
  const user = currentUser(req);
  const participation = await db.query.participationsTable.findFirst({
    where: and(
      eq(participationsTable.id, parsed.data.participationId),
      eq(participationsTable.userId, user.id),
    ),
  });
  if (!participation) {
    error(res, 404, "Participation not found.");
    return;
  }
  if (!["joined", "attended"].includes(participation.status)) {
    error(res, 409, "This participation is not ready for completion submission.");
    return;
  }
  const [updated] = await db
    .update(participationsTable)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(participationsTable.id, participation.id))
    .returning();
  const experience = await db.query.experiencesTable.findFirst({
    where: eq(experiencesTable.id, participation.experienceId),
  });
  if (experience) {
    const organisation = await db.query.organisationsTable.findFirst({
      where: eq(organisationsTable.id, experience.organisationId),
    });
    const host = organisation
      ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, organisation.ownerUserId) })
      : undefined;
    if (host) await sendTelegramMessage(host.telegramId, `<b>Verification required</b>\n${escapeTelegramHtml(user.name)} submitted completion for <b>${escapeTelegramHtml(experience.title)}</b>.`);
  }
  res.json(await participationResponse(updated));
});

router.get("/host/overview", async (req, res) => {
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    res.json({
      organisation: null,
      upcomingExperiences: 0,
      participantCount: 0,
      pendingVerifications: 0,
      totalExperiences: 0,
    });
    return;
  }
  const experiences = await db
    .select()
    .from(experiencesTable)
    .where(eq(experiencesTable.organisationId, organisation.id));
  const experienceIds = experiences.map((item) => item.id);
  const participations = experienceIds.length
    ? await db
        .select()
        .from(participationsTable)
        .where(inArray(participationsTable.experienceId, experienceIds))
    : [];
  res.json({
    organisation: organisationResponse(organisation),
    upcomingExperiences: experiences.filter((item) => ["published", "full"].includes(item.status)).length,
    participantCount: participations.length,
    pendingVerifications: participations.filter((item) => item.status === "submitted").length,
    totalExperiences: experiences.length,
  });
});

router.get("/host/experiences", async (req, res) => {
  const organisation = await currentOrganisation(currentUser(req).id);
  const rows = organisation
    ? await db
        .select()
        .from(experiencesTable)
        .where(eq(experiencesTable.organisationId, organisation.id))
        .orderBy(desc(experiencesTable.createdAt))
    : [];
  res.json(await Promise.all(rows.map((row) => experienceResponse(row))));
});

router.get("/host/experiences/:experienceId/participants", async (req, res) => {
  const parsed = ListExperienceParticipantsParams.safeParse({
    experienceId: Number(req.params.experienceId),
  });
  if (!parsed.success) {
    error(res, 400, "Invalid experience.");
    return;
  }
  const organisation = await currentOrganisation(currentUser(req).id);
  const experience = organisation
    ? await db.query.experiencesTable.findFirst({
        where: and(
          eq(experiencesTable.id, parsed.data.experienceId),
          eq(experiencesTable.organisationId, organisation.id),
        ),
      })
    : undefined;
  if (!experience) {
    error(res, 404, "Hosted experience not found.");
    return;
  }
  const rows = await db
    .select()
    .from(participationsTable)
    .where(eq(participationsTable.experienceId, experience.id))
    .orderBy(desc(participationsTable.joinedAt));
  res.json(await Promise.all(rows.map((row) => participationResponse(row))));
});

async function hostParticipation(req: Parameters<IRouter["get"]>[0] extends never ? never : any, participationId: number) {
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) return undefined;
  const participation = await db.query.participationsTable.findFirst({
    where: eq(participationsTable.id, participationId),
  });
  if (!participation) return undefined;
  const experience = await db.query.experiencesTable.findFirst({
    where: and(
      eq(experiencesTable.id, participation.experienceId),
      eq(experiencesTable.organisationId, organisation.id),
    ),
  });
  return experience ? participation : undefined;
}

router.post("/host/participations/:participationId/attend", async (req, res) => {
  const parsed = MarkAttendanceParams.safeParse({ participationId: Number(req.params.participationId) });
  if (!parsed.success) {
    error(res, 400, "Invalid participation.");
    return;
  }
  const participation = await hostParticipation(req, parsed.data.participationId);
  if (!participation) {
    error(res, 404, "Participation not found.");
    return;
  }
  const [updated] = await db
    .update(participationsTable)
    .set({ status: "attended", attendedAt: new Date() })
    .where(eq(participationsTable.id, participation.id))
    .returning();
  res.json(await participationResponse(updated));
});

router.post("/host/participations/:participationId/verify", async (req, res) => {
  const parsed = VerifyParticipationParams.safeParse({ participationId: Number(req.params.participationId) });
  if (!parsed.success) {
    error(res, 400, "Invalid participation.");
    return;
  }
  const participation = await hostParticipation(req, parsed.data.participationId);
  if (!participation) {
    error(res, 404, "Participation not found.");
    return;
  }
  const experience = await db.query.experiencesTable.findFirst({
    where: eq(experiencesTable.id, participation.experienceId),
  });
  const [updated] = await db
    .update(participationsTable)
    .set({ status: "verified", verifiedAt: new Date(), rewardStatus: "issued" })
    .where(eq(participationsTable.id, participation.id))
    .returning();
  if (experience) {
    const existingParticipant = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, participation.userId),
    });
    const [participant] = await db
      .update(usersTable)
      .set({ xp: (existingParticipant?.xp ?? 0) + experience.xpReward, updatedAt: new Date() })
      .where(eq(usersTable.id, participation.userId))
      .returning();
    if (participant) {
      await sendTelegramMessage(
        participant.telegramId,
        `<b>Contribution verified</b>\n\n${escapeTelegramHtml(experience.title)}\n+${experience.xpReward} XP${experience.monetaryRewardPence ? ` · £${(experience.monetaryRewardPence / 100).toFixed(2)}` : ""}\n\nYour progress has been updated.`,
        [[{ text: "View progress", web_app: { url: `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? process.env.REPLIT_DEV_DOMAIN}/?screen=profile` } }]],
      );
    }
  }
  res.json(await participationResponse(updated));
});

router.post("/host/participations/:participationId/reject", async (req, res) => {
  const parsed = RejectParticipationParams.safeParse({ participationId: Number(req.params.participationId) });
  if (!parsed.success) {
    error(res, 400, "Invalid participation.");
    return;
  }
  const participation = await hostParticipation(req, parsed.data.participationId);
  if (!participation) {
    error(res, 404, "Participation not found.");
    return;
  }
  const [updated] = await db
    .update(participationsTable)
    .set({ status: "rejected", rewardStatus: "pending" })
    .where(eq(participationsTable.id, participation.id))
    .returning();
  res.json(await participationResponse(updated));
});

router.get("/friends", async (req, res) => {
  const user = currentUser(req);
  const rows = await db
    .select({ user: usersTable })
    .from(friendshipsTable)
    .innerJoin(
      usersTable,
      or(
        and(eq(friendshipsTable.requesterUserId, user.id), eq(usersTable.id, friendshipsTable.recipientUserId)),
        and(eq(friendshipsTable.recipientUserId, user.id), eq(usersTable.id, friendshipsTable.requesterUserId)),
      ),
    )
    .where(eq(friendshipsTable.status, "accepted"));
  res.json(rows.map(({ user: friend }) => ({
    id: friend.id,
    name: friend.name,
    username: friend.username,
    avatarUrl: friend.avatarUrl,
  })));
});

router.get("/friends/requests", async (req, res) => {
  const rows = await db
    .select({ friendship: friendshipsTable, user: usersTable })
    .from(friendshipsTable)
    .innerJoin(usersTable, eq(usersTable.id, friendshipsTable.requesterUserId))
    .where(
      and(
        eq(friendshipsTable.recipientUserId, currentUser(req).id),
        eq(friendshipsTable.status, "pending"),
      ),
    );
  res.json(
    rows.map(({ friendship, user }) => ({
      id: friendship.id,
      user: { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl },
      status: friendship.status,
      createdAt: friendship.createdAt.toISOString(),
    })),
  );
});

router.get("/friends/requests/sent", async (req, res) => {
  const rows = await db
    .select({ friendship: friendshipsTable, user: usersTable })
    .from(friendshipsTable)
    .innerJoin(usersTable, eq(usersTable.id, friendshipsTable.recipientUserId))
    .where(
      and(
        eq(friendshipsTable.requesterUserId, currentUser(req).id),
        eq(friendshipsTable.status, "pending"),
      ),
    );
  res.json(
    rows.map(({ friendship, user }) => ({
      id: friendship.id,
      user: { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl },
      status: friendship.status,
      createdAt: friendship.createdAt.toISOString(),
    })),
  );
});

router.post("/friends/requests", async (req, res) => {
  const parsed = CreateFriendRequestBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Enter a Telegram username.");
    return;
  }
  const requester = currentUser(req);
  const recipient = await findUserByUsername(parsed.data.username);
  if (!recipient || recipient.id === requester.id) {
    error(res, 409, "That participant could not be found.");
    return;
  }
  const result = await createOrReopenFriendRequest(requester.id, recipient.id);
  if (result.outcome === "exists") {
    error(res, 409, "A request or friendship already exists.");
    return;
  }
  const created = result.request;
  await sendFriendRequestNotification(
    recipient.telegramId,
    requester.name,
    requester.username,
    created.id,
  );
  res.status(201).json({
    id: created.id,
    user: { id: recipient.id, name: recipient.name, username: recipient.username },
    status: created.status,
    createdAt: created.createdAt.toISOString(),
  });
});

async function updateFriendRequest(req: Parameters<IRouter["post"]>[0] extends never ? never : any, accepted: boolean) {
  const requestId = Number(req.params.requestId);
  const parsed = AcceptFriendRequestParams.safeParse({ requestId });
  if (!parsed.success) return undefined;
  const recipient = currentUser(req);
  const request = await db.query.friendshipsTable.findFirst({
    where: and(
      eq(friendshipsTable.id, requestId),
      eq(friendshipsTable.recipientUserId, recipient.id),
      eq(friendshipsTable.status, "pending"),
    ),
  });
  if (!request) return undefined;
  const [updated] = await db
    .update(friendshipsTable)
    .set({ status: accepted ? "accepted" : "declined", acceptedAt: accepted ? new Date() : null })
    .where(
      and(
        eq(friendshipsTable.id, request.id),
        eq(friendshipsTable.recipientUserId, recipient.id),
        eq(friendshipsTable.status, "pending"),
      ),
    )
    .returning();
  return updated;
}

router.post("/friends/requests/:requestId/accept", async (req, res) => {
  const updated = await updateFriendRequest(req, true);
  if (!updated) {
    error(res, 404, "Friend request not found.");
    return;
  }
  const requester = await db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.requesterUserId) });
  const recipient = currentUser(req);
  if (requester) await sendTelegramMessage(requester.telegramId, `${escapeTelegramHtml(recipient.name)} accepted your friend request.`);
  res.json({
    id: updated.id,
    user: { id: requester?.id ?? updated.requesterUserId, name: requester?.name ?? "Participant", username: requester?.username ?? null },
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.post("/friends/requests/:requestId/decline", async (req, res) => {
  const updated = await updateFriendRequest(req, false);
  if (!updated) {
    error(res, 404, "Friend request not found.");
    return;
  }
  const requester = await db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.requesterUserId) });
  res.json({
    id: updated.id,
    user: { id: requester?.id ?? updated.requesterUserId, name: requester?.name ?? "Participant", username: requester?.username ?? null },
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;