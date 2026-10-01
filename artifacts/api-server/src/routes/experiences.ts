import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AcceptFriendRequestParams,
  CreateExperienceBody,
  CreateFriendRequestBody,
  GetFriendProfileParams,
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
  CreateSocialInviteBody,
} from "@workspace/api-zod";
import { db, pool } from "@workspace/db";
import {
  emailAccountsTable,
  feedActivityEventsTable,
  feedPreferencesTable,
  experiencesTable,
  friendNotificationsTable,
  friendshipsTable,
  organisationsTable,
  participationsTable,
  usersTable,
  xpAwardsTable,
  type PersistedSocialLinks,
  type UserType,
} from "@workspace/db/schema";
import { redeemPendingXpAwards } from "../lib/xp-award-redemption.mjs";
import {
  currentUser,
  authenticateEmail,
  createEmailAccount,
  findUserByTelegramId,
  findUserByTelegramSession,
  findUserByUsername,
  issueTelegramSession,
  requireTelegramUser,
  upsertTelegramUser,
  verifyTelegramInitData,
} from "../lib/auth";
import { toEmailSignupResponse } from "../lib/email-auth-response";
import { logger } from "../lib/logger";
import { recordAnalyticsEvent } from "../lib/analytics";
import {
  canJoinOrWaitlist,
  canMarkAttendance,
  participationStatusForCapacity,
  isValidExperienceSchedule,
} from "../lib/experience-rules";
import { mergeDefinedFields } from "../lib/profile-rules";
import { hasSameTelegramIdentity } from "../lib/telegram-identity";
import {
  buildXpAwardsResponse,
} from "../lib/xp-award-rules";
import {
  currentOrganisation,
  experienceResponse,
  friendProfileResponse,
  organisationResponse,
  participationResponse,
  userResponse,
} from "../lib/data";
import { EMAIL_SIGNUP_XP_REWARD } from "../lib/account-type-values";
import { automaticActivityVisibility } from "../lib/feed-privacy";
import {
  sendCompletionSubmittedNotification,
  sendContributionRejectedNotification,
  sendContributionVerifiedNotification,
  sendAccountabilityInvitationNotification,
  sendExperienceJoinedNotification,
  sendFriendRequestAcceptedNotification,
  sendFriendRequestDeclinedNotification,
  sendFriendRequestNotification,
  sendFriendRequestSentNotification,
  sendHostNewParticipantNotification,
} from "../lib/telegram";
import { createOrReopenFriendRequest, updateFriendRequestStatus } from "../lib/friends";
import { createSocialInvite } from "../lib/social-invites";

const router: IRouter = Router();

const socialLinkDomains: Record<keyof PersistedSocialLinks, readonly string[]> = {
  website: [],
  instagram: ["instagram.com"],
  linkedin: ["linkedin.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
};

function isAllowedSocialLink(platform: string, value: string): boolean {
  const domains = socialLinkDomains[platform as keyof PersistedSocialLinks];
  if (!domains) return false;

  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      Boolean(url.hostname) &&
      (domains.length === 0 ||
        domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)))
    );
  } catch {
    return false;
  }
}

router.post("/auth/telegram", async (req, res) => {
  const parsed = AuthenticateTelegramBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Telegram login data is missing.");
    return;
  }

  let identity: ReturnType<typeof verifyTelegramInitData>;
  if (parsed.data.initData.startsWith("telegram_")) {
    const activeProfile = await findUserByTelegramSession(parsed.data.initData);
    const telegramId = Number(activeProfile?.telegramId);
    if (!activeProfile || !Number.isSafeInteger(telegramId) || telegramId <= 0) {
      error(res, 401, "Your Telegram session is invalid or expired. Sign in again.");
      return;
    }
    identity = {
      id: telegramId,
      first_name: activeProfile.name,
      photo_url: activeProfile.avatarUrl ?? undefined,
    };
  } else {
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
  }

  try {
    const existing = parsed.data.userType
      ? await findUserByTelegramId(identity.id, parsed.data.userType)
      : await findUserByTelegramId(identity.id);
    const inheritedUnassigned = parsed.data.userType && !existing
      ? await findUserByTelegramId(identity.id)
      : undefined;
    const user = await upsertTelegramUser(identity, parsed.data.userType);
    const sessionToken = await issueTelegramSession(user.id);
    recordAnalyticsEvent({
      source: "server",
      eventName: "auth_login",
      category: "telegram",
      platform: "telegram",
      outcome: "success",
    });
    res.json({
      user: await userResponse(user),
      isNew: !existing && inheritedUnassigned?.userType !== null,
      sessionToken,
    });
  } catch (accountError) {
    logger.error({ err: accountError }, "Telegram account initialization failed");
    error(res, 500, "Telegram was verified, but your profile could not be loaded. Please try again or use email.");
  }
});

router.post("/auth/email/signup", async (req, res) => {
  const parsed = SignUpWithEmailBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Enter your name, a valid email, a username with 5–32 letters, numbers, or underscores, and a password of at least 8 characters.");
    return;
  }
  try {
    const result = await createEmailAccount(parsed.data);
    recordAnalyticsEvent({
      source: "server",
      eventName: "auth_signup",
      category: "email",
      platform: "server",
      outcome: "success",
    });
    res.json(toEmailSignupResponse(await userResponse(result.user), result.sessionToken));
  } catch (signupError) {
    recordAnalyticsEvent({
      source: "server",
      eventName: "auth_signup",
      category: "email",
      platform: "server",
      outcome: "failure",
    });
    if (signupError instanceof Error && signupError.message === "EMAIL_ALREADY_REGISTERED") {
      error(res, 409, "That email is already registered. Log in instead.");
      return;
    }
    if (signupError instanceof Error && signupError.message === "USERNAME_ALREADY_TAKEN") {
      error(res, 409, "That username is already in use. Choose a different one.");
      return;
    }
    if (signupError instanceof Error && signupError.message === "EMAIL_AUTH_UNAVAILABLE") {
      error(res, 503, "Email sign-up is temporarily unavailable. Please try again.");
      return;
    }
    logger.error(
      { errorType: signupError instanceof Error ? signupError.name : typeof signupError },
      "Email signup failed",
    );
    error(res, 500, "We couldn't create your account. Please try again.");
  }
});

router.post("/auth/email/login", async (req, res) => {
  const parsed = LoginWithEmailBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Enter either your email or username and your password.");
    return;
  }
  const { email, username, password } = parsed.data;
  if (Boolean(email) === Boolean(username)) {
    error(res, 400, "Enter either your email or username and your password.");
    return;
  }
  const credentials = email ? { email, password } : username ? { username, password } : null;
  if (!credentials) {
    error(res, 400, "Enter either your email or username and your password.");
    return;
  }
  let result: Awaited<ReturnType<typeof authenticateEmail>>;
  try {
    result = await authenticateEmail(credentials);
  } catch (authError) {
    recordAnalyticsEvent({
      source: "server",
      eventName: "auth_login",
      category: "email",
      platform: "server",
      outcome: "failure",
    });
    logger.warn(
      { errorType: authError instanceof Error ? authError.name : typeof authError },
      "Email login could not be completed",
    );
    error(res, 503, "Email sign-in is temporarily unavailable. Please try again.");
    return;
  }
  if (!result) {
    recordAnalyticsEvent({
      source: "server",
      eventName: "auth_login",
      category: "email",
      platform: "server",
      outcome: "failure",
    });
    error(res, 401, "That email, username or password is not correct.");
    return;
  }
  recordAnalyticsEvent({
    source: "server",
    eventName: "auth_login",
    category: "email",
    platform: "server",
    outcome: "success",
  });
  res.json({ user: await userResponse(result.user), isNew: false, sessionToken: result.sessionToken });
});

router.use(requireTelegramUser);

router.post("/social-invites", async (req, res) => {
  const parsed = CreateSocialInviteBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Enter a valid Telegram username and invite type.");
    return;
  }
  const inviter = currentUser(req);
  if (parsed.data.kind === "accountability" && inviter.userType !== "participant") {
    error(res, inviter.userType === null ? 409 : 403, "Accountability invites require a participant profile.");
    return;
  }
  const username = parsed.data.username.replace(/^@/, "").trim().toLowerCase();
  if (username === inviter.username?.toLowerCase()) {
    error(res, 409, "You cannot invite yourself.");
    return;
  }
  if (await findUserByUsername(username)) {
    error(res, 409, "They already have an account. Send them a friend request first.");
    return;
  }
  try {
    res.status(201).json(await createSocialInvite(inviter, username, parsed.data.kind));
  } catch (inviteError) {
    logger.error({ err: inviteError, userId: inviter.id }, "Social invite creation failed");
    error(res, 500, "We couldn't create that invite. Please try again.");
  }
});

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

router.get("/me/xp-awards", async (req, res) => {
  const user = currentUser(req);
  const [persistedAwards, legacyExperiences, emailAccount] = await Promise.all([
    db
      .select()
      .from(xpAwardsTable)
      .where(eq(xpAwardsTable.userId, user.id))
      .orderBy(desc(xpAwardsTable.awardedAt)),
    db
      .select({
        participationId: participationsTable.id,
        title: experiencesTable.title,
        amount: experiencesTable.xpReward,
        awardedAt: participationsTable.verifiedAt,
      })
      .from(participationsTable)
      .innerJoin(
        experiencesTable,
        eq(experiencesTable.id, participationsTable.experienceId),
      )
      .where(
        and(
          eq(participationsTable.userId, user.id),
          eq(participationsTable.status, "verified"),
        ),
      )
      .orderBy(desc(participationsTable.verifiedAt)),
    db.query.emailAccountsTable.findFirst({
      where: eq(emailAccountsTable.userId, user.id),
      columns: { id: true },
    }),
  ]);
  res.json(
    buildXpAwardsResponse({
      balanceXp: user.xp,
      profileCreatedAt: user.createdAt,
      persistedAwards: persistedAwards.map((award) => ({
        id: award.id,
        sourceType: award.sourceType,
        sourceId: award.sourceId,
        sourceTitle: award.sourceTitle,
        amount: award.amount,
        status: award.status,
        awardedAt: award.awardedAt,
      })),
      legacyExperiences,
      hasLegacyEmailSignup: Boolean(emailAccount),
      signupXpReward: EMAIL_SIGNUP_XP_REWARD,
    }),
  );
});

router.post("/me/xp-awards/redeem", async (req, res) => {
  const user = currentUser(req);
  const result = await redeemPendingXpAwards(pool, user.id);
  const updatedUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, user.id),
  });
  if (!updatedUser) throw new Error("Profile not found.");

  res.json({
    redeemedXp: result.redeemedXp,
    user: await userResponse(updatedUser),
  });
});

router.patch("/me", async (req, res) => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Please check your profile details.");
    return;
  }
  const patch = parsed.data;
  const user = currentUser(req);
  if (patch.name !== undefined && !patch.name.trim()) {
    error(res, 400, "Name cannot be blank.");
    return;
  }
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
  if (
    patch.socialLinks &&
    Object.entries(patch.socialLinks).some(
      ([platform, value]) => value !== undefined && !isAllowedSocialLink(platform, value),
    )
  ) {
    error(res, 400, "Use valid HTTPS links for your website and social profiles.");
    return;
  }
  const username = patch.username === undefined
    ? user.username
    : patch.username.trim().replace(/^@+/, "").toLowerCase();
  if ((patch.userType ?? user.userType) !== null && !username) {
    error(res, 400, "Choose a unique username to finish creating your profile.");
    return;
  }
  if (patch.username !== undefined && !/^[a-z0-9_]{5,32}$/.test(username ?? "")) {
    error(res, 400, "Username must be 5–32 letters, numbers, or underscores.");
    return;
  }
  let updated: typeof user | undefined;
  try {
    updated = await db.transaction(async (transaction) => {
      let socialLinks: PersistedSocialLinks | undefined;
      if (patch.socialLinks !== undefined) {
        const latestUser = await transaction.query.usersTable.findFirst({
          where: eq(usersTable.id, user.id),
        });
        const normalizedPatch = Object.fromEntries(
          Object.entries(patch.socialLinks).flatMap(([platform, value]) =>
            value === undefined ? [] : [[platform, value.trim()]],
          ),
        );
        socialLinks = mergeDefinedFields(
          latestUser?.socialLinks ?? {},
          normalizedPatch,
        ) as PersistedSocialLinks;
      }
      if (patch.username !== undefined && username) {
        await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${username}, 0))`);
        const usernameOwner = await transaction.query.usersTable.findFirst({
          where: and(
            sql`lower(${usersTable.username}) = ${username}`,
            ne(usersTable.id, user.id),
          ),
        });
        if (usernameOwner) throw new Error("USERNAME_ALREADY_TAKEN");
      }

      const [updatedUser] = await transaction
        .update(usersTable)
        .set({
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.username !== undefined && username ? { username } : {}),
          ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
          ...(patch.city !== undefined ? { city: patch.city } : {}),
          ...(patch.country !== undefined ? { country: patch.country } : {}),
          ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
          ...(socialLinks !== undefined ? { socialLinks } : {}),
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
  } catch (updateError) {
    if (updateError instanceof Error && updateError.message === "USERNAME_ALREADY_TAKEN") {
      error(res, 409, "That username is already in use. Choose a different one.");
      return;
    }
    throw updateError;
  }
  recordAnalyticsEvent({
    source: "server",
    eventName: "profile_update",
    category: "profile",
    platform: "server",
    outcome: "success",
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
    const hasScheduleIssue = parsed.error.issues.some(({ path }) =>
      ["date", "startTime", "endTime"].includes(String(path[0])),
    );
    error(
      res,
      400,
      hasScheduleIssue
        ? "Use a real date in YYYY-MM-DD format and 24-hour times in HH:MM format."
        : "Please complete every experience field.",
    );
    return;
  }
  const user = currentUser(req);
  const input = parsed.data;
  if (!isValidExperienceSchedule(input.date, input.startTime, input.endTime)) {
    error(res, 400, "End time must be later than the start time.");
    return;
  }
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
      await transaction.insert(feedActivityEventsTable).values({
        actorId: user.id,
        type: "experience_published",
        targetType: "experience",
        targetId: createdExperience.id,
        visibility: "public",
        createdAt: createdExperience.createdAt,
      });
      return createdExperience;
    });
    recordAnalyticsEvent({
      source: "server",
      eventName: "experience_create",
      category: "create",
      platform: "server",
      outcome: "success",
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
  recordAnalyticsEvent({
    source: "server",
    eventName: "experience_view",
    category: "experience",
    platform: "server",
    outcome: "success",
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
  if (!canJoinOrWaitlist(experience.status)) {
    error(res, 409, "This experience is no longer open for new participants.");
    return;
  }
  const organisation = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, experience.organisationId),
  });
  const host = organisation
    ? await db.query.usersTable.findFirst({
        where: eq(usersTable.id, organisation.ownerUserId),
      })
    : undefined;
  if (host && hasSameTelegramIdentity(host, user)) {
    error(res, 403, "You can’t join an experience hosted by another profile linked to your Telegram account.");
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    const [lockedExperience] = await tx
      .select()
      .from(experiencesTable)
      .where(eq(experiencesTable.id, experience.id))
      .for("update");
    if (!lockedExperience || !canJoinOrWaitlist(lockedExperience.status)) {
      return { kind: "closed" as const };
    }
    const [existing] = await tx
      .select({ id: participationsTable.id })
      .from(participationsTable)
      .where(
        and(
          eq(participationsTable.experienceId, lockedExperience.id),
          eq(participationsTable.userId, user.id),
        ),
      )
      .limit(1);
    if (existing) return { kind: "already" as const };

    const [participantCount] = await tx
      .select({ value: count() })
      .from(participationsTable)
      .where(
        and(
          eq(participationsTable.experienceId, lockedExperience.id),
          inArray(participationsTable.status, ["joined", "attended", "submitted", "verified"]),
        ),
      );
    const status = participationStatusForCapacity(
      Number(participantCount?.value ?? 0),
      lockedExperience.capacity,
    );
    const [participation] = await tx
      .insert(participationsTable)
      .values({ experienceId: lockedExperience.id, userId: user.id, status })
      .returning();
    if (participation?.status === "joined") {
      const visibility = await automaticActivityVisibility(tx, user.id);
      await tx
        .insert(feedActivityEventsTable)
        .values({
          actorId: user.id,
          type: "experience_joined",
          targetType: "experience",
          targetId: lockedExperience.id,
          visibility,
          createdAt: participation.joinedAt,
        })
        .onConflictDoNothing();
    }
    return { kind: "created" as const, participation, experience: lockedExperience };
  });
  if (outcome.kind === "closed") {
    error(res, 409, "This experience is no longer open for new participants.");
    return;
  }
  if (outcome.kind === "already") {
    error(res, 409, "You are already participating in or waitlisted for this experience.");
    return;
  }
  const { participation: created, experience: joinedExperience } = outcome;
  if (created.status === "joined") {
    await sendExperienceJoinedNotification(user.telegramId, joinedExperience);
    if (host) {
      await sendHostNewParticipantNotification(host.telegramId, user.name, joinedExperience);
    }
  }
  recordAnalyticsEvent({
    source: "server",
    eventName: created.status === "waitlisted" ? "experience_waitlist_join" : "experience_join",
    category: "experience",
    platform: "server",
    outcome: "success",
  });
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
        ? results.filter((item) => ["joined", "attended", "waitlisted"].includes(item.status))
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
    .where(
      and(
        eq(participationsTable.id, participation.id),
        inArray(participationsTable.status, ["joined", "attended"]),
      ),
    )
    .returning();
  if (!updated) {
    error(res, 409, "This participation is no longer ready for completion submission.");
    return;
  }
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
    if (host) await sendCompletionSubmittedNotification(host.telegramId, user.name, experience);
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
      waitlistCount: 0,
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
    participantCount: participations.filter((item) =>
      ["joined", "attended", "submitted", "verified"].includes(item.status),
    ).length,
    waitlistCount: participations.filter((item) => item.status === "waitlisted").length,
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
  const waitingRows = rows.length
    ? await db
        .select({ experienceId: participationsTable.experienceId })
        .from(participationsTable)
        .where(
          and(
            inArray(participationsTable.experienceId, rows.map((row) => row.id)),
            eq(participationsTable.status, "waitlisted"),
          ),
        )
    : [];
  const waitlistCounts = new Map<number, number>();
  for (const row of waitingRows) {
    waitlistCounts.set(row.experienceId, (waitlistCounts.get(row.experienceId) ?? 0) + 1);
  }
  res.json(
    await Promise.all(
      rows.map(async (row) => ({
        ...(await experienceResponse(row)),
        waitlistCount: waitlistCounts.get(row.id) ?? 0,
      })),
    ),
  );
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

router.post("/host/experiences/:experienceId/promote-next", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const parsed = GetExperienceParams.safeParse({
    experienceId: Number(req.params.experienceId),
  });
  if (!parsed.success) {
    error(res, 400, "Invalid experience.");
    return;
  }
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    error(res, 404, "Hosted experience not found.");
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [experience] = await tx
      .select()
      .from(experiencesTable)
      .where(
        and(
          eq(experiencesTable.id, parsed.data.experienceId),
          eq(experiencesTable.organisationId, organisation.id),
        ),
      )
      .for("update");
    if (!experience) return { kind: "not-found" as const };
    if (!canJoinOrWaitlist(experience.status)) {
      return { kind: "closed" as const };
    }

    const [next] = await tx
      .select()
      .from(participationsTable)
      .where(
        and(
          eq(participationsTable.experienceId, experience.id),
          eq(participationsTable.status, "waitlisted"),
        ),
      )
      .orderBy(asc(participationsTable.joinedAt), asc(participationsTable.id))
      .limit(1)
      .for("update");
    if (!next) return { kind: "empty" as const };

    const [promoted] = await tx
      .update(participationsTable)
      .set({ status: "joined", joinedAt: new Date() })
      .where(
        and(
          eq(participationsTable.id, next.id),
          eq(participationsTable.status, "waitlisted"),
        ),
      )
      .returning();
    if (!promoted) return { kind: "race" as const };

    const [participantCount] = await tx
      .select({ value: count() })
      .from(participationsTable)
      .where(
        and(
          eq(participationsTable.experienceId, experience.id),
          inArray(participationsTable.status, ["joined", "attended", "submitted", "verified"]),
        ),
      );
    const requiredCapacity = Number(participantCount?.value ?? 0);
    const capacity = Math.max(experience.capacity, requiredCapacity);
    if (capacity !== experience.capacity || experience.status === "full") {
      await tx
        .update(experiencesTable)
        .set({ capacity, status: "published" })
        .where(eq(experiencesTable.id, experience.id));
    }
    return {
      kind: "promoted" as const,
      participation: promoted,
      experience: { ...experience, capacity },
    };
  });

  if (outcome.kind === "not-found") {
    error(res, 404, "Hosted experience not found.");
    return;
  }
  if (outcome.kind === "closed") {
    error(res, 409, "This experience is no longer accepting participants.");
    return;
  }
  if (outcome.kind === "empty") {
    error(res, 409, "There is no one on this waitlist to promote.");
    return;
  }
  if (outcome.kind === "race") {
    error(res, 409, "The waitlist changed. Refresh and try again.");
    return;
  }

  const participant = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, outcome.participation.userId),
  });
  if (participant) {
    await sendExperienceJoinedNotification(participant.telegramId, outcome.experience);
  }
  res.json(await participationResponse(outcome.participation));
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
  if (!canMarkAttendance(participation.status)) {
    error(res, 409, "Only joined participants can be marked as attended.");
    return;
  }
  const [updated] = await db
    .update(participationsTable)
    .set({ status: "attended", attendedAt: new Date() })
    .where(
      and(
        eq(participationsTable.id, participation.id),
        eq(participationsTable.status, "joined"),
      ),
    )
    .returning();
  if (!updated) {
    error(res, 409, "This participation can no longer be marked as attended.");
    return;
  }
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
  const participantAccount = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, participation.userId),
  });
  if (participantAccount && hasSameTelegramIdentity(participantAccount, currentUser(req))) {
    error(res, 403, "You can’t verify a contribution from another profile linked to your Telegram account.");
    return;
  }
  if (participation.status !== "submitted") {
    error(res, 409, "This contribution is no longer awaiting review.");
    return;
  }
  const experience = await db.query.experiencesTable.findFirst({
    where: eq(experiencesTable.id, participation.experienceId),
  });
  const verifiedAt = new Date();
  const updated = await db.transaction(async (transaction) => {
    const [verified] = await transaction
      .update(participationsTable)
      .set({ status: "verified", verifiedAt, rewardStatus: "issued" })
      .where(
        and(
          eq(participationsTable.id, participation.id),
          eq(participationsTable.status, "submitted"),
        ),
      )
      .returning();
    if (!verified) return undefined;
    if (experience && experience.xpReward > 0) {
      await transaction.insert(xpAwardsTable).values({
        userId: participation.userId,
        sourceType: "experience",
        sourceId: String(participation.id),
        sourceTitle: experience.title,
        amount: experience.xpReward,
        status: "pending",
        awardedAt: verifiedAt,
      });
    }
    if (experience) {
      const visibility = await automaticActivityVisibility(
        transaction,
        participation.userId,
      );
      await transaction
        .insert(feedActivityEventsTable)
        .values({
          actorId: participation.userId,
          type: "experience_verified",
          targetType: "experience",
          targetId: experience.id,
          metadata: { participationId: verified.id },
          visibility,
          createdAt: verifiedAt,
        })
        .onConflictDoNothing();
    }
    return verified;
  });
  if (!updated) {
    error(res, 409, "This contribution is no longer awaiting review.");
    return;
  }
  if (participantAccount && experience) {
    await sendContributionVerifiedNotification(participantAccount.telegramId, experience);
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
  if (participation.status !== "submitted") {
    error(res, 409, "This contribution is no longer awaiting review.");
    return;
  }
  const [updated] = await db
    .update(participationsTable)
    .set({ status: "rejected", rewardStatus: "pending" })
    .where(
      and(
        eq(participationsTable.id, participation.id),
        eq(participationsTable.status, "submitted"),
      ),
    )
    .returning();
  if (!updated) {
    error(res, 409, "This contribution is no longer awaiting review.");
    return;
  }
  const [experience, participant] = await Promise.all([
    db.query.experiencesTable.findFirst({
      where: eq(experiencesTable.id, participation.experienceId),
    }),
    db.query.usersTable.findFirst({
      where: eq(usersTable.id, participation.userId),
    }),
  ]);
  if (experience && participant) {
    await sendContributionRejectedNotification(participant.telegramId, experience);
  }
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

router.get("/friends/notifications", async (req, res) => {
  const recipientUserId = currentUser(req).id;
  const [rows, unreadRows] = await Promise.all([
    db
      .select({ notification: friendNotificationsTable, actor: usersTable })
      .from(friendNotificationsTable)
      .innerJoin(usersTable, eq(usersTable.id, friendNotificationsTable.actorUserId))
      .where(eq(friendNotificationsTable.recipientUserId, recipientUserId))
      .orderBy(desc(friendNotificationsTable.createdAt), desc(friendNotificationsTable.id))
      .limit(100),
    db
      .select({ count: count() })
      .from(friendNotificationsTable)
      .where(
        and(
          eq(friendNotificationsTable.recipientUserId, recipientUserId),
          isNull(friendNotificationsTable.readAt),
        ),
      ),
  ]);

  res.json({
    notifications: rows.map(({ notification, actor }) => {
      const title =
        notification.type === "friend_request"
          ? "New friend request"
          : notification.type === "friend_request_accepted"
            ? "Friend request accepted"
            : "Friend request declined";
      const message =
        notification.type === "friend_request"
          ? `${actor.name} wants to connect with you.`
          : notification.type === "friend_request_accepted"
            ? `${actor.name} accepted your friend request. You’re now friends.`
            : `${actor.name} declined your friend request.`;
      return {
        id: notification.id,
        friendshipId: notification.friendshipId,
        type: notification.type,
        title,
        message,
        actor: {
          id: actor.id,
          name: actor.name,
          username: actor.username,
          avatarUrl: actor.avatarUrl,
        },
        isUnread: notification.readAt === null,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
      };
    }),
    unreadCount: Number(unreadRows[0]?.count ?? 0),
  });
});

router.patch("/friends/notifications/:notificationId/read", async (req, res) => {
  const notificationId = Number(req.params.notificationId);
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    error(res, 404, "Notification not found.");
    return;
  }

  const recipientUserId = currentUser(req).id;
  const [updated] = await db
    .update(friendNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(friendNotificationsTable.id, notificationId),
        eq(friendNotificationsTable.recipientUserId, recipientUserId),
        isNull(friendNotificationsTable.readAt),
      ),
    )
    .returning({ id: friendNotificationsTable.id });

  if (!updated) {
    const [owned] = await db
      .select({ id: friendNotificationsTable.id })
      .from(friendNotificationsTable)
      .where(
        and(
          eq(friendNotificationsTable.id, notificationId),
          eq(friendNotificationsTable.recipientUserId, recipientUserId),
        ),
      )
      .limit(1);
    if (!owned) {
      error(res, 404, "Notification not found.");
      return;
    }
  }

  res.json({ success: true, message: "Notification marked as read." });
});

router.get("/friends/:friendId/profile", async (req, res) => {
  const parsed = GetFriendProfileParams.safeParse({ friendId: req.params.friendId });
  if (!parsed.success) {
    error(res, 404, "Friend profile not found.");
    return;
  }

  const viewer = currentUser(req);
  const friendId = parsed.data.friendId;
  const friendship = await db.query.friendshipsTable.findFirst({
    where: and(
      eq(friendshipsTable.status, "accepted"),
      or(
        and(
          eq(friendshipsTable.requesterUserId, viewer.id),
          eq(friendshipsTable.recipientUserId, friendId),
        ),
        and(
          eq(friendshipsTable.recipientUserId, viewer.id),
          eq(friendshipsTable.requesterUserId, friendId),
        ),
      ),
    ),
  });
  if (!friendship) {
    error(res, 404, "Friend profile not found.");
    return;
  }

  const friend = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, friendId),
  });
  if (!friend) {
    error(res, 404, "Friend profile not found.");
    return;
  }

  res.json(await friendProfileResponse(friend));
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
  await sendFriendRequestSentNotification(
    requester.telegramId,
    recipient.name,
    recipient.username,
  );
  await sendFriendRequestNotification(
    recipient.telegramId,
    requester.name,
    requester.username,
    created.id,
  );
  recordAnalyticsEvent({
    source: "server",
    eventName: "friend_request",
    category: "friendship",
    platform: "server",
    outcome: "success",
  });
  res.status(201).json({
    id: created.id,
    user: { id: recipient.id, name: recipient.name, username: recipient.username },
    status: created.status,
    createdAt: created.createdAt.toISOString(),
  });
});

async function updateFriendRequest(
  req: Request,
  recipientUserId: number,
  status: "accepted" | "declined",
) {
  const requestId = Number(req.params.requestId);
  const parsed = AcceptFriendRequestParams.safeParse({ requestId });
  if (!parsed.success) return undefined;
  return updateFriendRequestStatus(parsed.data.requestId, recipientUserId, status);
}

router.post("/friends/requests/:requestId/accept", async (req, res) => {
  const recipient = currentUser(req);
  const updated = await updateFriendRequest(req, recipient.id, "accepted");
  if (!updated) {
    error(res, 404, "Friend request not found.");
    return;
  }
  const requester = await db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.requesterUserId) });
  if (requester) {
    await sendFriendRequestAcceptedNotification(
      requester.telegramId,
      recipient.name,
      recipient.username,
    );
  }
  if (updated.accountabilityInviteCreated) {
    await sendAccountabilityInvitationNotification(recipient.telegramId);
  }
  res.json({
    id: updated.id,
    user: { id: requester?.id ?? updated.requesterUserId, name: requester?.name ?? "Participant", username: requester?.username ?? null },
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.post("/friends/requests/:requestId/decline", async (req, res) => {
  const recipient = currentUser(req);
  const updated = await updateFriendRequest(req, recipient.id, "declined");
  if (!updated) {
    error(res, 404, "Friend request not found.");
    return;
  }
  const requester = await db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.requesterUserId) });
  if (requester) {
    await sendFriendRequestDeclinedNotification(
      requester.telegramId,
      recipient.name,
      recipient.username,
    );
  }
  res.json({
    id: updated.id,
    user: { id: requester?.id ?? updated.requesterUserId, name: requester?.name ?? "Participant", username: requester?.username ?? null },
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;