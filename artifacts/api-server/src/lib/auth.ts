import crypto from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  emailAccountsTable,
  emailSessionsTable,
  telegramSessionsTable,
  usersTable,
  type User,
  type UserType,
} from "@workspace/db/schema";
import { verifyTelegramInitData as verifySignedTelegramInitData, type TelegramIdentity } from "./telegram-init-data";
import { logger } from "./logger";
import { selectTelegramProfile } from "./telegram-identity";
import {
  emailProfileValues,
  telegramProfileRoleUpdate,
  telegramProfileValues,
} from "./account-type-values";
import { createEphemeralSupabaseClient, getSupabaseAdminClient } from "./supabase";
import { verifyLegacyPassword } from "./legacy-password";

export type { TelegramIdentity } from "./telegram-init-data";

export type EmailSignupInput = {
  name: string;
  username: string;
  email: string;
  password: string;
  userType: UserType;
};

export type EmailLoginInput = {
  email: string;
  password: string;
};

export type AuthenticatedRequest = Request & {
  telegramUser?: User;
  authProvider?: "email" | "telegram";
  emailAccountId?: number;
};

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }
  return token;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getAuthErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }
  return "unknown";
}

function isDuplicateSupabaseEmail(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message).toLowerCase() : "";
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered")
  );
}

async function createSupabaseIdentity(
  email: string,
  password: string,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data.user?.id) return { id: data.user.id, created: true };

  if (error && isDuplicateSupabaseEmail(error)) {
    const { data: loginData, error: loginError } = await createEphemeralSupabaseClient()
      .auth.signInWithPassword({ email, password });
    if (
      !loginError &&
      loginData.user?.id &&
      normalizeEmail(loginData.user.email ?? "") === email
    ) {
      return { id: loginData.user.id, created: false };
    }
    throw new Error("EMAIL_ALREADY_REGISTERED");
  }

  logger.warn({ code: error ? getAuthErrorCode(error) : "missing_user" }, "Supabase Auth account creation failed.");
  throw new Error("EMAIL_AUTH_UNAVAILABLE");
}

async function verifySupabaseIdentity(
  email: string,
  password: string,
): Promise<string | undefined> {
  const { data, error } = await createEphemeralSupabaseClient()
    .auth.signInWithPassword({ email, password });
  if (error) {
    logger.warn({ code: getAuthErrorCode(error) }, "Supabase Auth login failed.");
    return undefined;
  }
  if (!data.user?.id || normalizeEmail(data.user.email ?? "") !== email) return undefined;
  return data.user.id;
}

async function deleteSupabaseIdentity(userId: string): Promise<void> {
  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    logger.warn({ code: getAuthErrorCode(error) }, "Unlinked Supabase Auth account could not be removed.");
  }
}

function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validatedTelegramPhotoUrl(photoUrl?: string): string | undefined {
  if (!photoUrl?.trim()) return undefined;
  try {
    const parsed = new URL(photoUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

async function issueEmailSession(userId: number, accountId: number): Promise<string> {
  const token = `email_${crypto.randomBytes(32).toString("base64url")}`;
  await db.insert(emailSessionsTable).values({
    emailAccountId: accountId,
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return token;
}

export async function issueTelegramSession(userId: number): Promise<string> {
  const token = `telegram_${crypto.randomBytes(32).toString("base64url")}`;
  await db.insert(telegramSessionsTable).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return token;
}

export async function issueProfileSession(req: Request, profile: User): Promise<string> {
  const owner = currentUser(req);
  if (owner.telegramId !== profile.telegramId) {
    throw new Error("PROFILE_NOT_OWNED");
  }

  const authenticated = req as AuthenticatedRequest;
  if (authenticated.authProvider === "email") {
    if (!authenticated.emailAccountId) throw new Error("EMAIL_SESSION_REQUIRED");
    return issueEmailSession(profile.id, authenticated.emailAccountId);
  }
  return issueTelegramSession(profile.id);
}

export async function createEmailAccount(input: EmailSignupInput): Promise<{ user: User }> {
  const email = normalizeEmail(input.email);
  const username = input.username.trim().replace(/^@+/, "").toLowerCase();

  const existingAccount = await db.query.emailAccountsTable.findFirst({
    where: eq(emailAccountsTable.email, email),
  });
  if (existingAccount) throw new Error("EMAIL_ALREADY_REGISTERED");

  const supabaseIdentity = await createSupabaseIdentity(email, input.password);

  try {
    const user = await db.transaction(async (transaction) => {
      const existing = await transaction.query.emailAccountsTable.findFirst({
        where: eq(emailAccountsTable.email, email),
      });
      if (existing) throw new Error("EMAIL_ALREADY_REGISTERED");

      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${username}, 0))`);
      const usernameOwner = await transaction.query.usersTable.findFirst({
        where: sql`lower(${usersTable.username}) = ${username}`,
      });
      if (usernameOwner) throw new Error("USERNAME_ALREADY_TAKEN");

      const [createdUser] = await transaction
        .insert(usersTable)
        .values(
          emailProfileValues(input, `email:${crypto.randomUUID()}`),
        )
        .returning();
      if (!createdUser) throw new Error("Unable to create email user.");

      const [account] = await transaction
        .insert(emailAccountsTable)
        .values({
          userId: createdUser.id,
          email,
          passwordHash: null,
          supabaseAuthUserId: supabaseIdentity.id,
        })
        .returning();
      if (!account) throw new Error("Unable to create email account.");
      return createdUser;
    });
    return { user };
  } catch (error) {
    if (supabaseIdentity.created) await deleteSupabaseIdentity(supabaseIdentity.id);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505" &&
      "constraint" in error &&
      error.constraint === "email_accounts_email_idx"
    ) {
      throw new Error("EMAIL_ALREADY_REGISTERED");
    }
    throw error;
  }
}

export async function authenticateEmail(input: EmailLoginInput): Promise<{ user: User; sessionToken: string } | undefined> {
  const email = normalizeEmail(input.email);
  const account = await db.query.emailAccountsTable.findFirst({
    where: eq(emailAccountsTable.email, email),
  });
  if (!account) return undefined;

  if (account.supabaseAuthUserId) {
    const authenticatedId = await verifySupabaseIdentity(email, input.password);
    if (authenticatedId !== account.supabaseAuthUserId) return undefined;
  } else {
    if (!verifyLegacyPassword(input.password, account.passwordHash)) return undefined;
    const identity = await createSupabaseIdentity(email, input.password);
    const [updatedAccount] = await db
      .update(emailAccountsTable)
      .set({
        supabaseAuthUserId: identity.id,
        passwordHash: null,
        updatedAt: new Date(),
      })
      .where(and(eq(emailAccountsTable.id, account.id), isNull(emailAccountsTable.supabaseAuthUserId)))
      .returning({ supabaseAuthUserId: emailAccountsTable.supabaseAuthUserId });
    if (!updatedAccount) {
      const concurrentAccount = await db.query.emailAccountsTable.findFirst({
        where: eq(emailAccountsTable.id, account.id),
      });
      if (concurrentAccount?.supabaseAuthUserId !== identity.id) {
        throw new Error("EMAIL_AUTH_MIGRATION_CONFLICT");
      }
    }
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, account.userId),
  });
  if (!user) return undefined;
  return { user, sessionToken: await issueEmailSession(user.id, account.id) };
}

export async function findEmailSession(
  sessionToken: string,
): Promise<{ user: User; emailAccountId: number } | undefined> {
  const tokenHash = hashSessionToken(sessionToken);
  const session = await db.query.emailSessionsTable.findFirst({
    where: and(
      eq(emailSessionsTable.tokenHash, tokenHash),
      gt(emailSessionsTable.expiresAt, new Date()),
    ),
  });
  if (session) {
    const account = await db.query.emailAccountsTable.findFirst({
      where: eq(emailAccountsTable.id, session.emailAccountId),
    });
    if (!account) return undefined;
    const accountOwner = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, account.userId),
    });
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, session.userId),
    });
    if (!accountOwner || !user || user.telegramId !== accountOwner.telegramId) return undefined;
    return { user, emailAccountId: account.id };
  }

  // Continue accepting existing profile-bound email sessions until they expire.
  const legacyAccount = await db.query.emailAccountsTable.findFirst({
    where: and(
      eq(emailAccountsTable.sessionTokenHash, tokenHash),
      gt(emailAccountsTable.sessionExpiresAt, new Date()),
    ),
  });
  if (!legacyAccount) return undefined;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, legacyAccount.userId),
  });
  return user ? { user, emailAccountId: legacyAccount.id } : undefined;
}

export async function findUserByEmailSession(sessionToken: string): Promise<User | undefined> {
  return (await findEmailSession(sessionToken))?.user;
}

export async function findUserByTelegramSession(sessionToken: string): Promise<User | undefined> {
  const session = await db.query.telegramSessionsTable.findFirst({
    where: and(
      eq(telegramSessionsTable.tokenHash, hashSessionToken(sessionToken)),
      gt(telegramSessionsTable.expiresAt, new Date()),
    ),
  });
  if (!session) return undefined;
  return db.query.usersTable.findFirst({
    where: eq(usersTable.id, session.userId),
  });
}

export function verifyTelegramInitData(initData: string): TelegramIdentity {
  return verifySignedTelegramInitData(initData, getBotToken());
}

export async function upsertTelegramUser(identity: TelegramIdentity, selectedUserType?: UserType): Promise<User> {
  const avatarUrl = validatedTelegramPhotoUrl(identity.photo_url);
  const telegramId = String(identity.id);
  return db.transaction(async (transaction) => {
    // Multiple profiles per role are now valid. Serialize sign-in upserts so
    // concurrent logins still reuse the existing profile instead of creating
    // duplicate profiles unintentionally.
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram:${telegramId}`}, 0))`,
    );
    const profiles = await transaction
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .orderBy(asc(usersTable.id));
    const existing = selectTelegramProfile(profiles, selectedUserType);

    if (existing) {
      const roleUpdate = telegramProfileRoleUpdate(existing.userType, selectedUserType);
      const claimUnassignedProfile = "userType" in roleUpdate;
      const [updated] = await transaction
        .update(usersTable)
        .set({
          ...roleUpdate,
          ...(avatarUrl && existing.avatarUrl !== avatarUrl ? { avatarUrl } : {}),
          updatedAt: new Date(),
        })
        .where(
          claimUnassignedProfile
            ? and(eq(usersTable.id, existing.id), isNull(usersTable.userType))
            : eq(usersTable.id, existing.id),
        )
        .returning();
      return updated ?? existing;
    }

    const [created] = await transaction
      .insert(usersTable)
      .values({
        telegramId,
        // Each profile owns its public username. Do not reuse Telegram's
        // username for a second profile under the same identity.
        ...telegramProfileValues(identity, avatarUrl, selectedUserType),
      })
      .returning();
    if (!created) throw new Error("Unable to create Telegram profile.");
    return created;
  });
}

export async function requireTelegramUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = req.header("authorization");
  const initData = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!initData) {
    res.status(401).json({ message: "Open Experiences.fun from Telegram to continue." });
    return;
  }

  try {
    if (initData.startsWith("email_")) {
      const emailSession = await findEmailSession(initData);
      if (!emailSession) {
        res.status(401).json({ message: "Your email session is invalid or expired." });
        return;
      }
      const authenticated = req as AuthenticatedRequest;
      authenticated.telegramUser = emailSession.user;
      authenticated.authProvider = "email";
      authenticated.emailAccountId = emailSession.emailAccountId;
      next();
      return;
    }
    if (initData.startsWith("telegram_")) {
      const user = await findUserByTelegramSession(initData);
      if (!user) {
        res.status(401).json({ message: "Your Telegram session is invalid or expired." });
        return;
      }
      const authenticated = req as AuthenticatedRequest;
      authenticated.telegramUser = user;
      authenticated.authProvider = "telegram";
      next();
      return;
    }
    const identity = verifyTelegramInitData(initData);
    const user = await upsertTelegramUser(identity);
    const authenticated = req as AuthenticatedRequest;
    authenticated.telegramUser = user;
    authenticated.authProvider = "telegram";
    next();
  } catch (error) {
    logger.warn({ err: error }, "Telegram authentication rejected");
    res.status(401).json({ message: "Your Telegram session is invalid or expired." });
  }
}

export function currentUser(req: Request): User {
  const user = (req as AuthenticatedRequest).telegramUser;
  if (!user) throw new Error("Authenticated user is missing.");
  return user;
}

export async function findUserByTelegramId(
  telegramId: number,
  userType?: UserType,
): Promise<User | undefined> {
  const matches = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, String(telegramId)))
    .orderBy(asc(usersTable.id));
  return userType ? matches.find((profile) => profile.userType === userType) : matches[0];
}

export async function findUserByUsername(username: string): Promise<User | undefined> {
  const normalized = username.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(normalized)) return undefined;
  return db.query.usersTable.findFirst({
    where: sql`lower(${usersTable.username}) = ${normalized.toLowerCase()}`,
  });
}