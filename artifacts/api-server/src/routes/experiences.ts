import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, notExists, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AcceptFriendRequestParams,
  CreateExperienceBody,
  CancelHostExperienceParams,
  CreateFriendRequestBody,
  GetFriendProfileParams,
  GetExperienceParams,
  GetHostExperienceMilestonesParams,
  ListExperiencesQueryParams,
  ListExperienceParticipantsParams,
  ListExploreActivityResponse,
  ListMyParticipationsQueryParams,
  MarkAttendanceParams,
  RejectParticipationParams,
  ReviewExperienceMilestoneSubmissionBody,
  ReviewExperienceMilestoneSubmissionParams,
  SubmitExperienceMilestoneParams,
  SubmitCompletionParams,
  AuthenticateTelegramBody,
  SignUpWithEmailBody,
  LoginWithEmailBody,
  UpdateMeBody,
  UpdateHostExperienceBody,
  UpdateHostExperienceParams,
  VerifyParticipationParams,
  CreateSocialInviteBody,
} from "@workspace/api-zod";
import { db, pool } from "@workspace/db";
import {
  emailAccountsTable,
  experienceMilestoneSubmissionsTable,
  experienceMilestoneReviewEventsTable,
  experienceMilestonesTable,
  feedActivityEventsTable,
  feedPreferencesTable,
  experiencesTable,
  experienceChallengesTable,
  friendNotificationsTable,
  friendshipsTable,
  organisationsTable,
  organisationVerificationApplicationsTable,
  organisationVerificationEventsTable,
  organisationTreasuriesTable,
  treasuryPayoutsTable,
  participationReviewEventsTable,
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
  canSubmitCompletion,
  participationStatusForCapacity,
  isValidExperienceSchedule,
} from "../lib/experience-rules";
import {
  areAllMilestoneStatusesVerified,
  hasValidMilestoneRewardTotal,
} from "../lib/experience-milestone-rules.mjs";
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
  sendMilestoneSubmittedNotification,
} from "../lib/telegram";
import { createOrReopenFriendRequest, updateFriendRequestStatus } from "../lib/friends";
import { createSocialInvite } from "../lib/social-invites";
import {
  isVerificationReviewer,
  isVerificationSelfReview,
  participationReviewReasonError,
  verificationReviewReasonError,
} from "../lib/organisation-verification-rules.mjs";

const router: IRouter = Router();
const EXPLORE_ACTIVITY_WINDOW_DAYS = 30;
const evidenceKeysForUser = (value: unknown, userId: number): string[] | undefined => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5) return undefined;
  if (value.some((key) =>
    typeof key !== "string" ||
    key.length > 200 ||
    !key.startsWith(`${userId}/`) ||
    key.includes("..")
  )) return undefined;
  return [...new Set(value as string[])];
};

router.get("/explore/activity", async (_req, res): Promise<void> => {
  const windowEnd = new Date();
  const windowStart = new Date(
    windowEnd.getTime() - EXPLORE_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const cities = await db
    .select({
      city: experiencesTable.city,
      verifiedCompletions: count(),
    })
    .from(participationsTable)
    .innerJoin(
      experiencesTable,
      eq(participationsTable.experienceId, experiencesTable.id),
    )
    .where(
      and(
        eq(participationsTable.status, "verified"),
        gte(participationsTable.verifiedAt, windowStart),
        lte(participationsTable.verifiedAt, windowEnd),
      ),
    )
    .groupBy(experiencesTable.city)
    .orderBy(asc(experiencesTable.city));

  res.json(
    ListExploreActivityResponse.parse({
      windowDays: EXPLORE_ACTIVITY_WINDOW_DAYS,
      cities: cities.map((row) => ({
        city: row.city,
        verifiedCompletions: Number(row.verifiedCompletions),
      })),
    }),
  );
});

const socialLinkDomains: Record<keyof PersistedSocialLinks, readonly string[]> = {
  website: [],
  instagram: ["instagram.com"],
  linkedin: ["linkedin.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
};

async function listExperienceMilestoneProgress(
  experienceId: number,
  participationId: number | null,
) {
  const rows = await db
    .select({
      id: experienceMilestonesTable.id,
      position: experienceMilestonesTable.position,
      title: experienceMilestonesTable.title,
      description: experienceMilestonesTable.description,
      xpReward: experienceMilestonesTable.xpReward,
      submissionId: experienceMilestoneSubmissionsTable.id,
      submissionVersion: experienceMilestoneSubmissionsTable.submissionVersion,
      status: experienceMilestoneSubmissionsTable.status,
      evidenceObjectKeys: experienceMilestoneSubmissionsTable.evidenceObjectKeys,
      reviewReason: experienceMilestoneSubmissionsTable.reviewReason,
      submittedAt: experienceMilestoneSubmissionsTable.submittedAt,
      verifiedAt: experienceMilestoneSubmissionsTable.verifiedAt,
    })
    .from(experienceMilestonesTable)
    .leftJoin(
      experienceMilestoneSubmissionsTable,
      and(
        eq(
          experienceMilestoneSubmissionsTable.milestoneId,
          experienceMilestonesTable.id,
        ),
        eq(
          experienceMilestoneSubmissionsTable.participationId,
          participationId ?? 0,
        ),
      ),
    )
    .where(eq(experienceMilestonesTable.experienceId, experienceId))
    .orderBy(asc(experienceMilestonesTable.position));

  return Promise.all(rows.map(async (row) => ({
    ...row,
    status: row.status ?? "not_started",
    evidenceObjectKeys: row.evidenceObjectKeys ?? [],
    reviewReason: row.reviewReason ?? null,
    submittedAt: row.submittedAt ?? null,
    verifiedAt: row.verifiedAt ?? null,
    reviewHistory: row.submissionId
      ? await db
          .select({
            decision: experienceMilestoneReviewEventsTable.decision,
            reason: experienceMilestoneReviewEventsTable.reason,
                    submissionVersion: experienceMilestoneReviewEventsTable.submissionVersion,
            reviewerName: usersTable.name,
            createdAt: experienceMilestoneReviewEventsTable.createdAt,
          })
          .from(experienceMilestoneReviewEventsTable)
          .innerJoin(usersTable, eq(usersTable.id, experienceMilestoneReviewEventsTable.reviewerUserId))
          .where(eq(experienceMilestoneReviewEventsTable.submissionId, row.submissionId))
          .orderBy(asc(experienceMilestoneReviewEventsTable.createdAt))
          .then((history) => history.map((event) => ({
            ...event,
            createdAt: event.createdAt.toISOString(),
          })))
      : [],
  })));
}

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
    await recordAnalyticsEvent({
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
    await recordAnalyticsEvent({
      source: "server",
      eventName: "auth_signup",
      category: "email",
      platform: "server",
      outcome: "success",
    });
    res.json(toEmailSignupResponse(await userResponse(result.user), result.sessionToken));
  } catch (signupError) {
    await recordAnalyticsEvent({
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
    await recordAnalyticsEvent({
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
    await recordAnalyticsEvent({
      source: "server",
      eventName: "auth_login",
      category: "email",
      platform: "server",
      outcome: "failure",
    });
    error(res, 401, "That email, username or password is not correct.");
    return;
  }
  await recordAnalyticsEvent({
    source: "server",
    eventName: "auth_login",
    category: "email",
    platform: "server",
    outcome: "success",
  });
  res.json({ user: await userResponse(result.user), isNew: false, sessionToken: result.sessionToken });
});

router.use(requireTelegramUser);

const companiesHouseSearchWindow = new Map<number, number[]>();

router.post("/organisations/verification/companies-house", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    error(res, 404, "Organisation profile not found.");
    return;
  }
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (query.length < 2 || query.length > 120) {
    error(res, 400, "Enter a company name or registration number.");
    return;
  }

  const now = Date.now();
  const recent = (companiesHouseSearchWindow.get(currentUser(req).id) ?? [])
    .filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 12) {
    error(res, 429, "Please wait before searching Companies House again.");
    return;
  }
  recent.push(now);
  companiesHouseSearchWindow.set(currentUser(req).id, recent);

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    error(res, 503, "Companies House lookup is not configured.");
    return;
  }
  try {
    const response = await fetch(
      `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      logger.warn({ status: response.status }, "Companies House search failed.");
      error(res, response.status === 429 ? 503 : 502, "Companies House lookup is temporarily unavailable.");
      return;
    }
    const payload = await response.json() as {
      items?: Array<{
        company_name?: string;
        company_number?: string;
        company_status?: string;
        type?: string;
        date_of_creation?: string;
        registered_office_address?: { locality?: string; postal_code?: string; country?: string };
      }>;
    };
    res.json({
      results: (payload.items ?? []).slice(0, 10).map((item) => ({
        name: item.company_name ?? "",
        registrationNumber: item.company_number ?? "",
        status: item.company_status ?? "",
        entityType: item.type ?? "",
        incorporatedOn: item.date_of_creation ?? null,
        registeredAddress: item.registered_office_address
          ? {
              locality: item.registered_office_address.locality ?? null,
              postalCode: item.registered_office_address.postal_code ?? null,
              country: item.registered_office_address.country ?? null,
            }
          : null,
      })),
    });
  } catch (cause) {
    logger.warn({ cause }, "Companies House search request failed.");
    error(res, 502, "Companies House lookup is temporarily unavailable.");
  }
});

router.get("/organisations/verification", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    error(res, 404, "Organisation profile not found.");
    return;
  }
  const [application] = await db
    .select()
    .from(organisationVerificationApplicationsTable)
    .where(eq(organisationVerificationApplicationsTable.organisationId, organisation.id))
    .orderBy(desc(organisationVerificationApplicationsTable.createdAt))
    .limit(1);
  const events = await db
    .select({
      id: organisationVerificationEventsTable.id,
      eventType: organisationVerificationEventsTable.eventType,
      createdAt: organisationVerificationEventsTable.createdAt,
    })
    .from(organisationVerificationEventsTable)
    .where(eq(organisationVerificationEventsTable.organisationId, organisation.id))
    .orderBy(asc(organisationVerificationEventsTable.createdAt));
  res.json({
    status: application?.status === "needs_information"
      ? "needs_information"
      : organisation.verificationStatus,
    submittedAt: organisation.verificationSubmittedAt?.toISOString() ?? null,
    reviewedAt: organisation.verificationReviewedAt?.toISOString() ?? null,
    history: events.map((event) => ({
      id: event.id,
      event: event.eventType,
      at: event.createdAt.toISOString(),
    })),
    application: application
      ? {
          id: application.id,
          legalName: application.legalName,
          organisationType: application.organisationType,
          jurisdiction: application.jurisdiction,
          registrationNumber: application.registrationNumber,
          website: application.website,
          representativeName: application.representativeName,
          representativeRole: application.representativeRole,
          contactEmail: application.contactEmail,
          status: application.status,
          reviewerNotes: application.reviewerNotes,
          evidenceObjectKeys: application.evidenceObjectKeys,
          submittedAt: application.submittedAt?.toISOString() ?? null,
          reviewedAt: application.reviewedAt?.toISOString() ?? null,
        }
      : null,
  });
});

router.put("/organisations/verification/draft", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    error(res, 404, "Organisation profile not found.");
    return;
  }
  const body = req.body ?? {};
  const evidenceObjectKeys = evidenceKeysForUser(body.evidenceObjectKeys, currentUser(req).id);
  if (!evidenceObjectKeys) {
    error(res, 400, "Evidence must be uploaded by this profile, with at most five files.");
    return;
  }
  const limits = {
    legalName: 180,
    organisationType: 48,
    jurisdiction: 80,
    representativeName: 120,
    representativeRole: 120,
    contactEmail: 254,
  } as const;
  const fields = Object.keys(limits) as (keyof typeof limits)[];
  const values: Record<keyof typeof limits, string | null> = {
    legalName: null,
    organisationType: null,
    jurisdiction: null,
    representativeName: null,
    representativeRole: null,
    contactEmail: null,
  };
  for (const field of fields) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      error(res, 400, "Verification draft fields must be text.");
      return;
    }
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length > limits[field]) {
      error(res, 400, "One or more verification fields are too long.");
      return;
    }
    values[field] = trimmed || null;
  }
  if (
    values.contactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)
  ) {
    error(res, 400, "Enter a valid contact email.");
    return;
  }
  let registrationNumber: string | null = null;
  if (body.registrationNumber !== undefined && body.registrationNumber !== null) {
    if (typeof body.registrationNumber !== "string" || body.registrationNumber.trim().length > 40) {
      error(res, 400, "Check the registration number.");
      return;
    }
    registrationNumber = body.registrationNumber.trim() || null;
  }
  let website: string | null = null;
  if (body.website !== undefined && body.website !== null && body.website !== "") {
    if (typeof body.website !== "string") {
      error(res, 400, "The organisation website must be a valid HTTPS address.");
      return;
    }
    try {
      const parsedWebsite = new URL(body.website.trim());
      if (parsedWebsite.protocol !== "https:" || parsedWebsite.username || parsedWebsite.password) throw new Error();
      website = parsedWebsite.origin;
    } catch {
      error(res, 400, "The organisation website must be a valid HTTPS address.");
      return;
    }
  }

  const savedAt = new Date();
  const result = await db.transaction(async (transaction) => {
    await transaction
      .select({ id: organisationsTable.id })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisation.id))
      .for("update");
    const [latest] = await transaction
      .select({
        id: organisationVerificationApplicationsTable.id,
        status: organisationVerificationApplicationsTable.status,
      })
      .from(organisationVerificationApplicationsTable)
      .where(eq(organisationVerificationApplicationsTable.organisationId, organisation.id))
      .orderBy(desc(organisationVerificationApplicationsTable.createdAt))
      .limit(1);
    if (latest && ["pending", "under_review", "verified", "suspended"].includes(latest.status)) {
      return undefined;
    }
    const draftValues = {
      applicantUserId: currentUser(req).id,
      status: "draft",
      submittedAt: null,
      ...values,
      registrationNumber,
      website,
      evidenceObjectKeys,
    } as const;
    if (latest?.status === "draft") {
      const [draft] = await transaction
        .update(organisationVerificationApplicationsTable)
        .set(draftValues)
        .where(eq(organisationVerificationApplicationsTable.id, latest.id))
        .returning({ id: organisationVerificationApplicationsTable.id });
      if (draft) {
        await transaction.insert(organisationVerificationEventsTable).values({
          organisationId: organisation.id,
          applicationId: draft.id,
          actorUserId: currentUser(req).id,
          eventType: "application_draft_saved",
          details: { status: "draft" },
        });
      }
      return draft;
    }
    const [draft] = await transaction
      .insert(organisationVerificationApplicationsTable)
      .values({ organisationId: organisation.id, ...draftValues })
      .returning({ id: organisationVerificationApplicationsTable.id });
    await transaction.insert(organisationVerificationEventsTable).values({
      organisationId: organisation.id,
      applicationId: draft.id,
      actorUserId: currentUser(req).id,
      eventType: "application_draft_saved",
      details: { status: "draft" },
    });
    return draft;
  });
  if (!result) {
    error(res, 409, "Your organisation already has an active verification decision or review.");
    return;
  }
  res.json({ id: result.id, status: "draft", savedAt: savedAt.toISOString() });
});

router.post("/organisations/verification/applications", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    error(res, 404, "Organisation profile not found.");
    return;
  }
  const body = req.body ?? {};
  const evidenceObjectKeys = evidenceKeysForUser(body.evidenceObjectKeys, currentUser(req).id);
  if (!evidenceObjectKeys) {
    error(res, 400, "Evidence must be uploaded by this profile, with at most five files.");
    return;
  }
  const fields = [
    "legalName",
    "organisationType",
    "jurisdiction",
    "representativeName",
    "representativeRole",
    "contactEmail",
  ] as const;
  if (fields.some((field) => typeof body[field] !== "string" || !body[field].trim())) {
    error(res, 400, "Complete all required organisation verification fields.");
    return;
  }
  const values = Object.fromEntries(fields.map((field) => [field, body[field].trim()])) as Record<typeof fields[number], string>;
  if (
    values.legalName.length > 180 ||
    values.organisationType.length > 48 ||
    values.jurisdiction.length > 80 ||
    values.representativeName.length > 120 ||
    values.representativeRole.length > 120 ||
    values.contactEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)
  ) {
    error(res, 400, "Check the organisation name, role, jurisdiction, and contact email.");
    return;
  }
  const registrationNumber = typeof body.registrationNumber === "string"
    ? body.registrationNumber.trim().slice(0, 40) || null
    : null;
  let website: string | null = null;
  if (typeof body.website === "string" && body.website.trim()) {
    try {
      const parsedWebsite = new URL(body.website.trim());
      if (parsedWebsite.protocol !== "https:" || parsedWebsite.username || parsedWebsite.password) throw new Error();
      website = parsedWebsite.origin;
    } catch {
      error(res, 400, "The organisation website must be a valid HTTPS address.");
      return;
    }
  }

  const submittedAt = new Date();
  const result = await db.transaction(async (transaction) => {
    const [lockedOrganisation] = await transaction
      .select({ id: organisationsTable.id })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisation.id))
      .for("update");
    if (!lockedOrganisation) throw new Error("Organisation profile not found.");
    const [latestApplication] = await transaction
      .select({
        id: organisationVerificationApplicationsTable.id,
        status: organisationVerificationApplicationsTable.status,
      })
      .from(organisationVerificationApplicationsTable)
      .where(eq(organisationVerificationApplicationsTable.organisationId, organisation.id))
      .orderBy(desc(organisationVerificationApplicationsTable.createdAt))
      .limit(1);
    if (
      latestApplication &&
      ["pending", "under_review", "verified", "suspended"].includes(latestApplication.status)
    ) return undefined;
    const [application] = latestApplication?.status === "draft"
      ? await transaction
          .update(organisationVerificationApplicationsTable)
          .set({
            applicantUserId: currentUser(req).id,
            status: "pending",
            submittedAt,
            ...values,
            registrationNumber,
            website,
            evidenceObjectKeys,
          })
          .where(eq(organisationVerificationApplicationsTable.id, latestApplication.id))
          .returning()
      : await transaction
          .insert(organisationVerificationApplicationsTable)
          .values({
            organisationId: organisation.id,
            applicantUserId: currentUser(req).id,
            status: "pending",
            submittedAt,
            ...values,
            registrationNumber,
            website,
            evidenceObjectKeys,
          })
          .returning();
    if (!application) throw new Error("Unable to submit verification application.");
    await transaction
      .update(organisationsTable)
      .set({
        verificationStatus: "pending",
        verificationSubmittedAt: submittedAt,
        verificationReviewedAt: null,
        verified: false,
      })
      .where(eq(organisationsTable.id, organisation.id));
    await transaction.insert(organisationVerificationEventsTable).values({
      organisationId: organisation.id,
      applicationId: application.id,
      actorUserId: currentUser(req).id,
      eventType: "application_submitted",
      details: { status: "pending" },
    });
    return application;
  });
  if (!result) {
    error(res, 409, "Your organisation already has an application awaiting review.");
    return;
  }
  res.status(201).json({
    id: result.id,
    status: result.status,
    submittedAt: submittedAt.toISOString(),
  });
});

router.get("/admin/organisation-verification/access", async (req, res) => {
  const reviewerId = process.env.VERIFICATION_REVIEWER_TELEGRAM_ID;
  res.json({
    canReview: Boolean(
      reviewerId && isVerificationReviewer(reviewerId, currentUser(req).telegramId),
    ),
  });
});

router.get("/admin/organisation-verification/applications", async (req, res) => {
  const reviewerId = process.env.VERIFICATION_REVIEWER_TELEGRAM_ID;
  if (!reviewerId) {
    error(res, 503, "Verification review is not configured.");
    return;
  }
  if (!isVerificationReviewer(reviewerId, currentUser(req).telegramId)) {
    error(res, 403, "You cannot review verification applications.");
    return;
  }
  const applications = await db
    .select({
      id: organisationVerificationApplicationsTable.id,
      organisationId: organisationVerificationApplicationsTable.organisationId,
      organisationName: organisationsTable.name,
      legalName: organisationVerificationApplicationsTable.legalName,
      organisationType: organisationVerificationApplicationsTable.organisationType,
      jurisdiction: organisationVerificationApplicationsTable.jurisdiction,
      registrationNumber: organisationVerificationApplicationsTable.registrationNumber,
      website: organisationVerificationApplicationsTable.website,
      representativeName: organisationVerificationApplicationsTable.representativeName,
      representativeRole: organisationVerificationApplicationsTable.representativeRole,
      contactEmail: organisationVerificationApplicationsTable.contactEmail,
      status: organisationVerificationApplicationsTable.status,
      reviewerNotes: organisationVerificationApplicationsTable.reviewerNotes,
      evidenceObjectKeys: organisationVerificationApplicationsTable.evidenceObjectKeys,
      submittedAt: organisationVerificationApplicationsTable.submittedAt,
      createdAt: organisationVerificationApplicationsTable.createdAt,
    })
    .from(organisationVerificationApplicationsTable)
    .innerJoin(
      organisationsTable,
      eq(organisationsTable.id, organisationVerificationApplicationsTable.organisationId),
    )
    .where(inArray(organisationVerificationApplicationsTable.status, [
      "pending",
      "under_review",
      "needs_information",
    ]))
    .orderBy(asc(organisationVerificationApplicationsTable.createdAt))
    .limit(100);
  res.json(applications.map((application) => ({
    ...application,
    submittedAt: application.submittedAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
  })));
});

router.post("/admin/organisation-verification/:applicationId/review", async (req, res) => {
  const reviewerId = process.env.VERIFICATION_REVIEWER_TELEGRAM_ID;
  if (!reviewerId || !isVerificationReviewer(reviewerId, currentUser(req).telegramId)) {
    error(res, reviewerId ? 403 : 503, reviewerId ? "You cannot review verification applications." : "Verification review is not configured.");
    return;
  }
  const applicationId = Number(req.params.applicationId);
  const action = req.body?.action;
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;
  if (!Number.isSafeInteger(applicationId) || applicationId < 1 || !["approve", "reject", "needs_information", "suspend"].includes(action)) {
    error(res, 400, "Choose a valid review action.");
    return;
  }
  if (note && note.length > 500) {
    error(res, 400, "Review notes must be 500 characters or fewer.");
    return;
  }
  const reasonError = verificationReviewReasonError(action, note);
  if (reasonError) {
    error(res, 400, reasonError);
    return;
  }
  const reviewer = currentUser(req);
  const reviewedAt = new Date();
  const outcome = await db.transaction(async (transaction) => {
    const [application] = await transaction
      .select()
      .from(organisationVerificationApplicationsTable)
      .where(eq(organisationVerificationApplicationsTable.id, applicationId))
      .for("update");
    if (!application || !["pending", "under_review", "needs_information"].includes(application.status)) return undefined;
    const [applicant] = await transaction
      .select({ telegramId: usersTable.telegramId })
      .from(usersTable)
      .where(eq(usersTable.id, application.applicantUserId))
      .limit(1);
    if (isVerificationSelfReview({
      applicantUserId: application.applicantUserId,
      reviewerUserId: reviewer.id,
      applicantTelegramId: applicant?.telegramId,
      reviewerTelegramId: reviewer.telegramId,
    })) return "self_review";
    const [latestApplication] = await transaction
      .select({ id: organisationVerificationApplicationsTable.id })
      .from(organisationVerificationApplicationsTable)
      .where(eq(organisationVerificationApplicationsTable.organisationId, application.organisationId))
      .orderBy(desc(organisationVerificationApplicationsTable.createdAt))
      .limit(1);
    if (latestApplication?.id !== application.id) return undefined;
    const status = action === "approve"
      ? "verified"
      : action === "reject"
        ? "rejected"
        : action === "suspend"
          ? "suspended"
          : "needs_information";
    await transaction
      .update(organisationVerificationApplicationsTable)
      .set({ status, reviewerNotes: note, reviewedAt })
      .where(eq(organisationVerificationApplicationsTable.id, application.id));
    await transaction
      .update(organisationsTable)
      .set({
        verificationStatus: action === "approve"
          ? "verified"
          : action === "reject"
            ? "rejected"
            : action === "suspend"
              ? "suspended"
              : "pending",
        verificationReviewedAt: reviewedAt,
        verified: action === "approve",
      })
      .where(eq(organisationsTable.id, application.organisationId));
    await transaction.insert(organisationVerificationEventsTable).values({
      organisationId: application.organisationId,
      applicationId: application.id,
      actorUserId: reviewer.id,
      eventType: `application_${status}`,
      details: {
        previousStatus: application.status,
        status,
        ...(note ? { reason: note } : {}),
      },
    });
    return { id: application.id, status, reviewedAt: reviewedAt.toISOString() };
  });
  if (outcome === "self_review") {
    error(res, 403, "You cannot review an application submitted from your own account.");
    return;
  }
  if (!outcome) {
    error(res, 409, "This application is no longer awaiting review.");
    return;
  }
  res.json(outcome);
});

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
          notExists(
            db
              .select({ id: experienceMilestonesTable.id })
              .from(experienceMilestonesTable)
              .where(
                eq(
                  experienceMilestonesTable.experienceId,
                  experiencesTable.id,
                ),
              ),
          ),
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
          ...(profile.type !== undefined ? { organisationType: profile.type } : {}),
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
  await recordAnalyticsEvent({
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
  if (!hasValidMilestoneRewardTotal(input.milestones, input.xpReward)) {
    error(
      res,
      400,
      "Milestone XP rewards must add up to the experience XP reward.",
    );
    return;
  }
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
      if (input.milestones?.length) {
        await transaction.insert(experienceMilestonesTable).values(
          input.milestones.map((milestone, index) => ({
            experienceId: createdExperience.id,
            position: index + 1,
            title: milestone.title.trim(),
            description: milestone.description?.trim() || null,
            xpReward: milestone.xpReward,
          })),
        );
      }
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
    await recordAnalyticsEvent({
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
  await recordAnalyticsEvent({
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
    milestones: await listExperienceMilestoneProgress(
      experience.id,
      participation?.id ?? null,
    ),
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
  await recordAnalyticsEvent({
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
      ? results.filter((item) => item.status === "verified")
      : parsed.data.status === "upcoming"
        ? results.filter((item) => ["joined", "attended", "waitlisted"].includes(item.status))
        : results,
  );
});

router.delete("/participations/:participationId", async (req, res) => {
  if (!enforceAccountType(req, res, "participant")) return;
  const parsed = SubmitCompletionParams.safeParse({
    participationId: Number(req.params.participationId),
  });
  if (!parsed.success) {
    error(res, 400, "Invalid participation.");
    return;
  }

  const user = currentUser(req);
  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(participationsTable)
      .where(
        and(
          eq(participationsTable.id, parsed.data.participationId),
          eq(participationsTable.userId, user.id),
        ),
      )
      .limit(1);
    if (!existing) return { kind: "not-found" as const };

    // Match the host promotion lock order so a concurrent promotion cannot
    // turn a waitlist withdrawal into deletion of a confirmed place.
    await tx
      .select({ id: experiencesTable.id })
      .from(experiencesTable)
      .where(eq(experiencesTable.id, existing.experienceId))
      .for("update");
    const [waitlisted] = await tx
      .select()
      .from(participationsTable)
      .where(
        and(
          eq(participationsTable.id, existing.id),
          eq(participationsTable.userId, user.id),
          eq(participationsTable.status, "waitlisted"),
        ),
      )
      .for("update");
    if (!waitlisted) return { kind: "not-waitlisted" as const };

    await tx
      .delete(participationsTable)
      .where(eq(participationsTable.id, waitlisted.id));
    return { kind: "withdrawn" as const };
  });

  if (outcome.kind === "not-found") {
    error(res, 404, "Waitlist entry not found.");
    return;
  }
  if (outcome.kind === "not-waitlisted") {
    error(res, 409, "Only a waitlisted place can be withdrawn from here.");
    return;
  }
  res.status(204).end();
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
  const statement = typeof req.body?.statement === "string" ? req.body.statement.trim() : "";
  const evidenceObjectKeys = evidenceKeysForUser(
    req.body?.evidenceObjectKeys,
    user.id,
  );
  if (!evidenceObjectKeys) {
    error(res, 400, "Evidence must be uploaded by this profile, with at most five files.");
    return;
  }
  if (statement.length < 20 || statement.length > 1500) {
    error(res, 400, "Add a completion statement between 20 and 1,500 characters.");
    return;
  }
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
  const [configuredMilestone] = await db
    .select({ id: experienceMilestonesTable.id })
    .from(experienceMilestonesTable)
    .where(eq(experienceMilestonesTable.experienceId, participation.experienceId))
    .limit(1);
  if (configuredMilestone) {
    error(res, 409, "Submit each milestone from the experience timeline.");
    return;
  }
  if (!canSubmitCompletion(participation.status)) {
    error(res, 409, "This participation is not ready for completion submission.");
    return;
  }
  const [updated] = await db
    .update(participationsTable)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      completionStatement: statement,
      evidenceObjectKeys,
      submissionVersion: sql`${participationsTable.submissionVersion} + 1`,
      reviewedByUserId: null,
      reviewedAt: null,
    })
    .where(
      and(
        eq(participationsTable.id, participation.id),
        inArray(participationsTable.status, ["joined", "attended", "rejected"]),
      ),
    )
    .returning();
  if (!updated) {
    error(res, 409, "This participation is no longer ready for completion submission.");
    return;
  }
  await recordAnalyticsEvent({
    source: "server",
    eventName: "completion_submit",
    category: "experience",
    platform: "server",
    outcome: "success",
  });
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

router.post(
  "/participations/:participationId/milestones/:milestoneId/submit",
  async (req, res) => {
    if (!enforceAccountType(req, res, "participant")) return;
    const parsed = SubmitExperienceMilestoneParams.safeParse({
      participationId: Number(req.params.participationId),
      milestoneId: Number(req.params.milestoneId),
    });
    if (!parsed.success) {
      error(res, 400, "Invalid milestone submission.");
      return;
    }

    const user = currentUser(req);
    const evidenceObjectKeys = evidenceKeysForUser(
      req.body?.evidenceObjectKeys,
      user.id,
    );
    if (!evidenceObjectKeys) {
      error(res, 400, "Evidence must be uploaded by this profile, with at most five files.");
      return;
    }
    const outcome = await db.transaction(async (transaction) => {
      const [participation] = await transaction
        .select()
        .from(participationsTable)
        .where(
          and(
            eq(participationsTable.id, parsed.data.participationId),
            eq(participationsTable.userId, user.id),
          ),
        )
        .for("update");
      if (!participation) return { kind: "not-found" as const };
      if (!["joined", "attended"].includes(participation.status)) {
        return { kind: "not-ready" as const };
      }

      const [milestone] = await transaction
        .select()
        .from(experienceMilestonesTable)
        .where(
          and(
            eq(experienceMilestonesTable.id, parsed.data.milestoneId),
            eq(experienceMilestonesTable.experienceId, participation.experienceId),
          ),
        )
        .limit(1);
      if (!milestone) return { kind: "not-found" as const };

      const [existingSubmission] = await transaction
        .select()
        .from(experienceMilestoneSubmissionsTable)
        .where(
          and(
            eq(experienceMilestoneSubmissionsTable.milestoneId, milestone.id),
            eq(
              experienceMilestoneSubmissionsTable.participationId,
              participation.id,
            ),
          ),
        )
        .for("update");
      if (
        existingSubmission?.status === "submitted" ||
        existingSubmission?.status === "verified"
      ) {
        return { kind: "not-submittable" as const };
      }

      const submittedAt = new Date();
      const [submission] = existingSubmission
        ? await transaction
            .update(experienceMilestoneSubmissionsTable)
            .set({
              status: "submitted",
              submittedAt,
              verifiedAt: null,
              reviewReason: null,
              evidenceObjectKeys,
              submissionVersion: sql`${experienceMilestoneSubmissionsTable.submissionVersion} + 1`,
            })
            .where(
              and(
                eq(experienceMilestoneSubmissionsTable.id, existingSubmission.id),
                eq(experienceMilestoneSubmissionsTable.status, "rejected"),
              ),
            )
            .returning()
        : await transaction
            .insert(experienceMilestoneSubmissionsTable)
            .values({
              milestoneId: milestone.id,
              participationId: participation.id,
              status: "submitted",
              submittedAt,
              evidenceObjectKeys,
            })
            .onConflictDoNothing()
            .returning();
      if (!submission) return { kind: "not-submittable" as const };

      return {
        kind: "submitted" as const,
        experienceId: participation.experienceId,
        progress: {
          id: milestone.id,
          position: milestone.position,
          title: milestone.title,
          description: milestone.description,
          xpReward: milestone.xpReward,
          status: "submitted" as const,
          submittedAt: submission.submittedAt,
          verifiedAt: null,
        },
      };
    });

    if (outcome.kind === "not-found") {
      error(res, 404, "Participation or milestone not found.");
      return;
    }
    if (outcome.kind !== "submitted") {
      error(res, 409, "This milestone cannot be submitted in its current state.");
      return;
    }

    await recordAnalyticsEvent({
      source: "server",
      eventName: "milestone_submit",
      category: "experience",
      platform: "server",
      outcome: "success",
    });
    const experience = await db.query.experiencesTable.findFirst({
      where: eq(experiencesTable.id, outcome.experienceId),
    });
    if (experience) {
      const organisation = await db.query.organisationsTable.findFirst({
        where: eq(organisationsTable.id, experience.organisationId),
      });
      const host = organisation
        ? await db.query.usersTable.findFirst({
            where: eq(usersTable.id, organisation.ownerUserId),
          })
        : undefined;
      if (host) {
        await sendMilestoneSubmittedNotification(
          host.telegramId,
          user.name,
          experience,
          outcome.progress.title,
        );
      }
    }
    res.json(outcome.progress);
  },
);

router.get("/host/overview", async (req, res) => {
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    res.json({
      organisation: null,
      upcomingExperiences: 0,
      participantCount: 0,
      waitlistCount: 0,
      monthlyVerifiedCompletions: 0,
      pendingCompletionReviews: 0,
      pendingMilestoneReviews: 0,
      pendingVerifications: 0,
      totalExperiences: 0,
      rewardedUserCount: 0,
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
  const [pendingMilestoneSubmissions] = experienceIds.length
    ? await db
        .select({ value: count() })
        .from(experienceMilestoneSubmissionsTable)
        .innerJoin(
          experienceMilestonesTable,
          eq(
            experienceMilestonesTable.id,
            experienceMilestoneSubmissionsTable.milestoneId,
          ),
        )
        .where(
          and(
            inArray(experienceMilestonesTable.experienceId, experienceIds),
            eq(experienceMilestoneSubmissionsTable.status, "submitted"),
          ),
        )
    : [{ value: 0 }];
  const pendingCompletionReviews = participations.filter(
    (item) => item.status === "submitted",
  ).length;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthlyVerifiedCompletions = participations.filter(
    (item) =>
      item.status === "verified" &&
      item.verifiedAt !== null &&
      item.verifiedAt >= monthStart,
  ).length;
  const pendingMilestoneReviews = Number(pendingMilestoneSubmissions?.value ?? 0);
  const [paidRecipients] = await db
    .select({ value: sql<number>`count(distinct ${treasuryPayoutsTable.recipientUserId})` })
    .from(treasuryPayoutsTable)
    .innerJoin(organisationTreasuriesTable, eq(treasuryPayoutsTable.treasuryId, organisationTreasuriesTable.id))
    .where(and(
      eq(organisationTreasuriesTable.organisationId, organisation.id),
      eq(treasuryPayoutsTable.status, "paid"),
    ));
  res.json({
    organisation: organisationResponse(organisation),
    upcomingExperiences: experiences.filter((item) => ["published", "full"].includes(item.status)).length,
    participantCount: participations.filter((item) =>
      ["joined", "attended", "submitted", "verified"].includes(item.status),
    ).length,
    waitlistCount: participations.filter((item) => item.status === "waitlisted").length,
    monthlyVerifiedCompletions,
    pendingCompletionReviews,
    pendingMilestoneReviews,
    pendingVerifications: pendingCompletionReviews + pendingMilestoneReviews,
    totalExperiences: experiences.length,
    rewardedUserCount: Number(paidRecipients?.value ?? 0),
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

router.patch("/host/experiences/:experienceId", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const parsedParams = UpdateHostExperienceParams.safeParse({
    experienceId: Number(req.params.experienceId),
  });
  if (!parsedParams.success) {
    error(res, 400, "Invalid experience.");
    return;
  }
  const parsedBody = UpdateHostExperienceBody.safeParse(req.body);
  if (!parsedBody.success) {
    const hasScheduleIssue = parsedBody.error.issues.some(({ path }) =>
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
  const input = parsedBody.data;
  if (!isValidExperienceSchedule(input.date, input.startTime, input.endTime)) {
    error(res, 400, "End time must be later than the start time.");
    return;
  }
  const organisation = await currentOrganisation(user.id);
  if (!organisation) {
    error(res, 404, "Hosted experience not found.");
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(experiencesTable)
      .where(
        and(
          eq(experiencesTable.id, parsedParams.data.experienceId),
          eq(experiencesTable.organisationId, organisation.id),
        ),
      )
      .for("update");
    if (!existing) return { kind: "not-found" as const };
    if (!["published", "full"].includes(existing.status)) {
      return { kind: "closed" as const };
    }

    const [participantCountRow] = await tx
      .select({ value: count() })
      .from(participationsTable)
      .where(
        and(
          eq(participationsTable.experienceId, existing.id),
          inArray(participationsTable.status, [
            "joined",
            "attended",
            "submitted",
            "verified",
            "rejected",
          ]),
        ),
      );
    const participantCount = Number(participantCountRow?.value ?? 0);
    if (input.capacity < participantCount) {
      return { kind: "capacity" as const, participantCount };
    }

    const existingMilestones = await tx
      .select()
      .from(experienceMilestonesTable)
      .where(eq(experienceMilestonesTable.experienceId, existing.id))
      .orderBy(asc(experienceMilestonesTable.position))
      .for("update");
    const [submissionCountRow] = await tx
      .select({ value: count() })
      .from(experienceMilestoneSubmissionsTable)
      .innerJoin(
        experienceMilestonesTable,
        eq(
          experienceMilestonesTable.id,
          experienceMilestoneSubmissionsTable.milestoneId,
        ),
      )
      .where(eq(experienceMilestonesTable.experienceId, existing.id));
    const hasMilestoneHistory = Number(submissionCountRow?.value ?? 0) > 0;
    const requestedMilestones = input.milestones;
    const effectiveMilestones = requestedMilestones ?? existingMilestones.map((milestone) => ({
      title: milestone.title,
      description: milestone.description,
      xpReward: milestone.xpReward,
    }));
    if (
      effectiveMilestones.length > 0 &&
      !hasValidMilestoneRewardTotal(effectiveMilestones, input.xpReward)
    ) {
      return { kind: "milestone-rewards" as const };
    }
    if (
      hasMilestoneHistory &&
      requestedMilestones !== undefined &&
      (
        requestedMilestones.length !== existingMilestones.length ||
        requestedMilestones.some((milestone, index) => {
          const previous = existingMilestones[index];
          return !previous
            || milestone.title.trim() !== previous.title
            || (milestone.description?.trim() || null) !== previous.description
            || milestone.xpReward !== previous.xpReward;
        })
      )
    ) {
      return { kind: "milestones-locked" as const };
    }

    const [updatedOrganisation] = await tx
      .update(organisationsTable)
      .set({
        name: input.organisationName.trim(),
        description:
          input.organisationDescription?.trim() || organisation.description,
      })
      .where(eq(organisationsTable.id, organisation.id))
      .returning();
    if (!updatedOrganisation) return { kind: "not-found" as const };

    if (requestedMilestones !== undefined && !hasMilestoneHistory) {
      await tx
        .delete(experienceMilestonesTable)
        .where(eq(experienceMilestonesTable.experienceId, existing.id));
      if (requestedMilestones.length) {
        await tx.insert(experienceMilestonesTable).values(
          requestedMilestones.map((milestone, index) => ({
            experienceId: existing.id,
            position: index + 1,
            title: milestone.title.trim(),
            description: milestone.description?.trim() || null,
            xpReward: milestone.xpReward,
          })),
        );
      }
    }

    const nextStatus = participantCount >= input.capacity ? "full" : "published";
    const [updatedExperience] = await tx
      .update(experiencesTable)
      .set({
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location.trim(),
        city: input.city.trim(),
        capacity: input.capacity,
        xpReward: input.xpReward,
        monetaryRewardPence: input.monetaryRewardPence,
        whatToBring: input.whatToBring?.trim() || null,
        whatYouWillDo: input.whatYouWillDo?.trim() || null,
        status: nextStatus,
      })
      .where(eq(experiencesTable.id, existing.id))
      .returning();
    return updatedExperience
      ? { kind: "updated" as const, experience: updatedExperience }
      : { kind: "not-found" as const };
  });

  if (outcome.kind === "not-found") {
    error(res, 404, "Hosted experience not found.");
    return;
  }
  if (outcome.kind === "closed") {
    error(res, 409, "Only active experiences can be edited.");
    return;
  }
  if (outcome.kind === "capacity") {
    error(
      res,
      409,
      `Capacity cannot be lower than the ${outcome.participantCount} confirmed participants.`,
    );
    return;
  }
  if (outcome.kind === "milestone-rewards") {
    error(res, 400, "Milestone XP rewards must add up to the experience XP reward.");
    return;
  }
  if (outcome.kind === "milestones-locked") {
    error(
      res,
      409,
      "Milestones cannot be changed after participants have submitted them. Other experience details can still be edited.",
    );
    return;
  }
  await recordAnalyticsEvent({
    source: "server",
    eventName: "experience_edit",
    category: "host",
    platform: "server",
    outcome: "success",
  });
  res.json(await experienceResponse(outcome.experience));
});

router.post("/host/experiences/:experienceId/cancel", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const parsed = CancelHostExperienceParams.safeParse({
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
    const [existing] = await tx
      .select()
      .from(experiencesTable)
      .where(
        and(
          eq(experiencesTable.id, parsed.data.experienceId),
          eq(experiencesTable.organisationId, organisation.id),
        ),
      )
      .for("update");
    if (!existing) return { kind: "not-found" as const };
    if (!["published", "full"].includes(existing.status)) {
      return { kind: "closed" as const };
    }
    const [cancelled] = await tx
      .update(experiencesTable)
      .set({ status: "cancelled" })
      .where(eq(experiencesTable.id, existing.id))
      .returning();
    return cancelled
      ? { kind: "cancelled" as const, experience: cancelled }
      : { kind: "not-found" as const };
  });
  if (outcome.kind === "not-found") {
    error(res, 404, "Hosted experience not found.");
    return;
  }
  if (outcome.kind === "closed") {
    error(res, 409, "This experience is no longer active.");
    return;
  }
  await recordAnalyticsEvent({
    source: "server",
    eventName: "experience_cancel",
    category: "host",
    platform: "server",
    outcome: "success",
  });
  res.json(await experienceResponse(outcome.experience));
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

router.get("/host/experiences/:experienceId/milestones", async (req, res) => {
  if (!enforceAccountType(req, res, "organisation")) return;
  const parsed = GetHostExperienceMilestonesParams.safeParse({
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

  const [milestones, submissions, [submissionCount]] = await Promise.all([
    db
      .select({
        id: experienceMilestonesTable.id,
        position: experienceMilestonesTable.position,
        title: experienceMilestonesTable.title,
        description: experienceMilestonesTable.description,
        xpReward: experienceMilestonesTable.xpReward,
      })
      .from(experienceMilestonesTable)
      .where(eq(experienceMilestonesTable.experienceId, experience.id))
      .orderBy(asc(experienceMilestonesTable.position)),
    db
      .select({
        id: experienceMilestoneSubmissionsTable.id,
        participationId: experienceMilestoneSubmissionsTable.participationId,
        milestoneId: experienceMilestonesTable.id,
        participant: {
          id: usersTable.id,
          name: usersTable.name,
          username: usersTable.username,
          avatarUrl: usersTable.avatarUrl,
        },
        milestoneTitle: experienceMilestonesTable.title,
        milestonePosition: experienceMilestonesTable.position,
        xpReward: experienceMilestonesTable.xpReward,
        status: experienceMilestoneSubmissionsTable.status,
        submittedAt: experienceMilestoneSubmissionsTable.submittedAt,
        verifiedAt: experienceMilestoneSubmissionsTable.verifiedAt,
        evidenceObjectKeys: experienceMilestoneSubmissionsTable.evidenceObjectKeys,
        reviewReason: experienceMilestoneSubmissionsTable.reviewReason,
        submissionVersion: experienceMilestoneSubmissionsTable.submissionVersion,
      })
      .from(experienceMilestoneSubmissionsTable)
      .innerJoin(
        experienceMilestonesTable,
        eq(
          experienceMilestonesTable.id,
          experienceMilestoneSubmissionsTable.milestoneId,
        ),
      )
      .innerJoin(
        participationsTable,
        eq(
          participationsTable.id,
          experienceMilestoneSubmissionsTable.participationId,
        ),
      )
      .innerJoin(usersTable, eq(usersTable.id, participationsTable.userId))
      .where(
        eq(experienceMilestonesTable.experienceId, experience.id),
      )
      .orderBy(
        asc(experienceMilestonesTable.position),
        asc(experienceMilestoneSubmissionsTable.submittedAt),
      ),
    db
      .select({ value: count() })
      .from(experienceMilestoneSubmissionsTable)
      .innerJoin(
        experienceMilestonesTable,
        eq(
          experienceMilestonesTable.id,
          experienceMilestoneSubmissionsTable.milestoneId,
        ),
      )
      .where(eq(experienceMilestonesTable.experienceId, experience.id)),
  ]);
  res.json({
    milestones,
    submissions,
    milestonesEditable: Number(submissionCount?.value ?? 0) === 0,
  });
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
  await recordAnalyticsEvent({
    source: "server",
    eventName: "experience_attend",
    category: "host",
    platform: "server",
    outcome: "success",
  });
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
  const [configuredMilestone] = await db
    .select({ id: experienceMilestonesTable.id })
    .from(experienceMilestonesTable)
    .where(eq(experienceMilestonesTable.experienceId, participation.experienceId))
    .limit(1);
  if (configuredMilestone) {
    error(res, 409, "Review each milestone from the host milestone queue.");
    return;
  }
  const verifiedAt = new Date();
  const updated = await db.transaction(async (transaction) => {
    const [verified] = await transaction
      .update(participationsTable)
      .set({
        status: "verified",
        verifiedAt,
        rewardStatus: "issued",
        reviewReason: null,
        reviewedByUserId: currentUser(req).id,
        reviewedAt: verifiedAt,
      })
      .where(
        and(
          eq(participationsTable.id, participation.id),
          eq(participationsTable.status, "submitted"),
        ),
      )
      .returning();
    if (!verified) return undefined;
    await transaction.insert(participationReviewEventsTable).values({
      participationId: verified.id,
      reviewerUserId: currentUser(req).id,
      submissionVersion: Math.max(1, participation.submissionVersion),
      decision: "verified",
      reason: null,
      createdAt: verifiedAt,
    });
    await transaction
      .update(experienceChallengesTable)
      .set({ status: "completed", completedAt: verifiedAt })
      .where(
        and(
          eq(experienceChallengesTable.experienceId, participation.experienceId),
          eq(experienceChallengesTable.challengedUserId, participation.userId),
          eq(experienceChallengesTable.status, "accepted"),
        ),
      );
    if (experience && experience.xpReward > 0) {
      await transaction.insert(xpAwardsTable).values({
        userId: participation.userId,
        sourceType: "experience",
        sourceId: String(participation.id),
        sourceTitle: experience.title,
        amount: experience.xpReward,
        status: "pending",
        awardedAt: verifiedAt,
      }).onConflictDoNothing();
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
  await recordAnalyticsEvent({
    source: "server",
    eventName: "completion_verify",
    category: "host",
    platform: "server",
    outcome: "success",
  });
  if (participantAccount && experience) {
    await sendContributionVerifiedNotification(participantAccount.telegramId, experience);
  }
  res.json(await participationResponse(updated));
});

router.post(
  "/host/milestone-submissions/:submissionId/review",
  async (req, res) => {
    if (!enforceAccountType(req, res, "organisation")) return;
    const params = ReviewExperienceMilestoneSubmissionParams.safeParse({
      submissionId: Number(req.params.submissionId),
    });
    const body = ReviewExperienceMilestoneSubmissionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      error(res, 400, "Choose whether to verify or reject this milestone.");
      return;
    }

    const reviewer = currentUser(req);
    const reviewReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (body.data.action === "reject" && reviewReason.length < 5) {
      error(res, 400, "Add a rejection reason of at least 5 characters.");
      return;
    }
    const organisation = await currentOrganisation(reviewer.id);
    if (!organisation) {
      error(res, 404, "Hosted milestone submission not found.");
      return;
    }

    const outcome = await db.transaction(async (transaction) => {
      const [context] = await transaction
        .select({
          participationId: experienceMilestoneSubmissionsTable.participationId,
          milestoneId: experienceMilestonesTable.id,
          experienceId: experiencesTable.id,
          experienceTitle: experiencesTable.title,
          organisationId: experiencesTable.organisationId,
          milestoneTitle: experienceMilestonesTable.title,
          milestonePosition: experienceMilestonesTable.position,
          xpReward: experienceMilestonesTable.xpReward,
        })
        .from(experienceMilestoneSubmissionsTable)
        .innerJoin(
          experienceMilestonesTable,
          eq(
            experienceMilestonesTable.id,
            experienceMilestoneSubmissionsTable.milestoneId,
          ),
        )
        .innerJoin(
          experiencesTable,
          eq(experiencesTable.id, experienceMilestonesTable.experienceId),
        )
        .where(
          and(
            eq(experienceMilestoneSubmissionsTable.id, params.data.submissionId),
            eq(experiencesTable.organisationId, organisation.id),
          ),
        );
      if (!context) return { kind: "not-found" as const };

      const [participation] = await transaction
        .select()
        .from(participationsTable)
        .where(eq(participationsTable.id, context.participationId))
        .for("update");
      if (!participation) return { kind: "not-found" as const };

      const [submission] = await transaction
        .select()
        .from(experienceMilestoneSubmissionsTable)
        .where(
          and(
            eq(experienceMilestoneSubmissionsTable.id, params.data.submissionId),
            eq(
              experienceMilestoneSubmissionsTable.participationId,
              participation.id,
            ),
          ),
        )
        .for("update");
      if (!submission || submission.status !== "submitted") {
        return { kind: "conflict" as const };
      }

      const participant = await transaction.query.usersTable.findFirst({
        where: eq(usersTable.id, participation.userId),
      });
      if (!participant) return { kind: "not-found" as const };
      if (hasSameTelegramIdentity(participant, reviewer)) {
        return { kind: "forbidden" as const };
      }

      if (body.data.action === "reject") {
        const [rejected] = await transaction
          .update(experienceMilestoneSubmissionsTable)
          .set({ status: "rejected", verifiedAt: null, reviewReason })
          .where(
            and(
              eq(experienceMilestoneSubmissionsTable.id, submission.id),
              eq(experienceMilestoneSubmissionsTable.status, "submitted"),
            ),
          )
          .returning();
        if (!rejected) return { kind: "conflict" as const };
        await transaction.insert(experienceMilestoneReviewEventsTable).values({
          submissionId: rejected.id,
          reviewerUserId: reviewer.id,
          submissionVersion: rejected.submissionVersion,
          decision: "rejected",
          reason: reviewReason,
        });
        return {
          kind: "reviewed" as const,
          complete: false,
          action: "reject" as const,
          result: {
            id: rejected.id,
            submissionVersion: rejected.submissionVersion,
            participationId: rejected.participationId,
            milestoneId: context.milestoneId,
            participant: {
              id: participant.id,
              name: participant.name,
              username: participant.username,
              avatarUrl: participant.avatarUrl,
            },
            milestoneTitle: context.milestoneTitle,
            milestonePosition: context.milestonePosition,
            xpReward: context.xpReward,
            status: rejected.status,
            evidenceObjectKeys: rejected.evidenceObjectKeys,
            reviewReason: rejected.reviewReason,
            submittedAt: rejected.submittedAt,
            verifiedAt: rejected.verifiedAt,
          },
        };
      }

      const verifiedAt = new Date();
      const [verified] = await transaction
        .update(experienceMilestoneSubmissionsTable)
        .set({ status: "verified", verifiedAt })
        .where(
          and(
            eq(experienceMilestoneSubmissionsTable.id, submission.id),
            eq(experienceMilestoneSubmissionsTable.status, "submitted"),
          ),
        )
        .returning();
      if (!verified) return { kind: "conflict" as const };
      await transaction.insert(experienceMilestoneReviewEventsTable).values({
        submissionId: verified.id,
        reviewerUserId: reviewer.id,
        submissionVersion: verified.submissionVersion,
        decision: "verified",
      });

      if (context.xpReward > 0) {
        await transaction
          .insert(xpAwardsTable)
          .values({
            userId: participation.userId,
            sourceType: "milestone",
            sourceId: String(verified.id),
            sourceTitle: `${context.experienceTitle} · ${context.milestoneTitle}`,
            amount: context.xpReward,
            status: "pending",
            awardedAt: verifiedAt,
          })
          .onConflictDoNothing();
      }

      const statuses = await transaction
        .select({
          status: experienceMilestoneSubmissionsTable.status,
        })
        .from(experienceMilestonesTable)
        .leftJoin(
          experienceMilestoneSubmissionsTable,
          and(
            eq(
              experienceMilestoneSubmissionsTable.milestoneId,
              experienceMilestonesTable.id,
            ),
            eq(
              experienceMilestoneSubmissionsTable.participationId,
              participation.id,
            ),
          ),
        )
        .where(eq(experienceMilestonesTable.experienceId, context.experienceId));
      const complete = areAllMilestoneStatusesVerified(
        statuses.map((item) => item.status ?? "not_started"),
      );

      if (complete) {
        await transaction
          .update(participationsTable)
          .set({ status: "verified", verifiedAt, rewardStatus: "issued" })
          .where(eq(participationsTable.id, participation.id));
        await transaction
          .update(experienceChallengesTable)
          .set({ status: "completed", completedAt: verifiedAt })
          .where(
            and(
              eq(experienceChallengesTable.experienceId, participation.experienceId),
              eq(experienceChallengesTable.challengedUserId, participation.userId),
              eq(experienceChallengesTable.status, "accepted"),
            ),
          );

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
            targetId: context.experienceId,
            metadata: { participationId: participation.id },
            visibility,
            createdAt: verifiedAt,
          })
          .onConflictDoNothing();
      }

      return {
        kind: "reviewed" as const,
        complete,
        action: "verify" as const,
        experienceId: context.experienceId,
        participantTelegramId: participant.telegramId,
        result: {
          id: verified.id,
          submissionVersion: verified.submissionVersion,
          participationId: verified.participationId,
          milestoneId: context.milestoneId,
          participant: {
            id: participant.id,
            name: participant.name,
            username: participant.username,
            avatarUrl: participant.avatarUrl,
          },
          milestoneTitle: context.milestoneTitle,
          milestonePosition: context.milestonePosition,
          xpReward: context.xpReward,
          status: verified.status,
          evidenceObjectKeys: verified.evidenceObjectKeys,
          reviewReason: verified.reviewReason,
          submittedAt: verified.submittedAt,
          verifiedAt: verified.verifiedAt,
        },
      };
    });

    if (outcome.kind === "not-found") {
      error(res, 404, "Hosted milestone submission not found.");
      return;
    }
    if (outcome.kind === "forbidden") {
      error(
        res,
        403,
        "You can’t review a milestone from another profile linked to your Telegram account.",
      );
      return;
    }
    if (outcome.kind === "conflict") {
      error(res, 409, "This milestone is no longer awaiting review.");
      return;
    }
    await recordAnalyticsEvent({
      source: "server",
      eventName: outcome.action === "verify" ? "milestone_verify" : "milestone_reject",
      category: "host",
      platform: "server",
      outcome: "success",
    });
    if (outcome.action === "verify" && outcome.complete) {
      const experience = await db.query.experiencesTable.findFirst({
        where: eq(experiencesTable.id, outcome.experienceId),
      });
      if (experience) {
        await sendContributionVerifiedNotification(
          outcome.participantTelegramId,
          experience,
        );
      }
    }
    res.json(outcome.result);
  },
);

router.post("/host/participations/:participationId/reject", async (req, res) => {
  const parsed = RejectParticipationParams.safeParse({ participationId: Number(req.params.participationId) });
  if (!parsed.success) {
    error(res, 400, "Invalid participation.");
    return;
  }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const reasonError = participationReviewReasonError(reason);
  if (reasonError) {
    error(res, 400, reasonError);
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
    error(res, 403, "You can’t review a contribution from another profile linked to your Telegram account.");
    return;
  }
  if (participation.status !== "submitted") {
    error(res, 409, "This contribution is no longer awaiting review.");
    return;
  }
  const reviewedAt = new Date();
  const updated = await db.transaction(async (transaction) => {
    const [rejected] = await transaction
      .update(participationsTable)
      .set({
        status: "rejected",
        rewardStatus: "pending",
        reviewReason: reason,
        reviewedByUserId: currentUser(req).id,
        reviewedAt,
      })
      .where(
        and(
          eq(participationsTable.id, participation.id),
          eq(participationsTable.status, "submitted"),
        ),
      )
      .returning();
    if (!rejected) return undefined;
    await transaction.insert(participationReviewEventsTable).values({
      participationId: rejected.id,
      reviewerUserId: currentUser(req).id,
      submissionVersion: Math.max(1, participation.submissionVersion),
      decision: "rejected",
      reason,
      createdAt: reviewedAt,
    });
    return rejected;
  });
  if (!updated) {
    error(res, 409, "This contribution is no longer awaiting review.");
    return;
  }
  await recordAnalyticsEvent({
    source: "server",
    eventName: "completion_reject",
    category: "host",
    platform: "server",
    outcome: "success",
  });
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
    city: friend.city,
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
  await recordAnalyticsEvent({
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