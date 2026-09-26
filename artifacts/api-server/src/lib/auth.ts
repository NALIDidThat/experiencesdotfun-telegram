import crypto from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  emailAccountsTable,
  telegramSessionsTable,
  usersTable,
  type User,
  type UserType,
} from "@workspace/db/schema";
import { verifyTelegramInitData as verifySignedTelegramInitData, type TelegramIdentity } from "./telegram-init-data";
import { logger } from "./logger";
import { selectTelegramProfile } from "./telegram-identity";

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

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const [saltHex, hashHex] = encodedHash.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
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
  await db
    .update(emailAccountsTable)
    .set({
      sessionTokenHash: hashSessionToken(token),
      sessionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    })
    .where(eq(emailAccountsTable.id, accountId));
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

export async function createEmailAccount(input: EmailSignupInput): Promise<{ user: User; sessionToken: string }> {
  const email = normalizeEmail(input.email);
  const username = input.username.trim().replace(/^@+/, "").toLowerCase();
  const sessionToken = `email_${crypto.randomBytes(32).toString("base64url")}`;
  const sessionTokenHash = hashSessionToken(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const passwordHash = hashPassword(input.password);

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
        .values({
          telegramId: `email:${crypto.randomUUID()}`,
          name: input.name.trim(),
          username,
          userType: input.userType,
        })
        .returning();
      if (!createdUser) throw new Error("Unable to create email user.");

      const [account] = await transaction
        .insert(emailAccountsTable)
        .values({
          userId: createdUser.id,
          email,
          passwordHash,
          sessionTokenHash,
          sessionExpiresAt,
        })
        .returning();
      if (!account) throw new Error("Unable to create email account.");
      return createdUser;
    });
    return { user, sessionToken };
  } catch (error) {
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
  if (!account || !verifyPassword(input.password, account.passwordHash)) return undefined;

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, account.userId),
  });
  if (!user) return undefined;
  return { user, sessionToken: await issueEmailSession(user.id, account.id) };
}

export async function findUserByEmailSession(sessionToken: string): Promise<User | undefined> {
  const account = await db.query.emailAccountsTable.findFirst({
    where: and(
      eq(emailAccountsTable.sessionTokenHash, hashSessionToken(sessionToken)),
      gt(emailAccountsTable.sessionExpiresAt, new Date()),
    ),
  });
  if (!account) return undefined;
  return db.query.usersTable.findFirst({
    where: eq(usersTable.id, account.userId),
  });
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
  const name = [identity.first_name, identity.last_name].filter(Boolean).join(" ") || "Telegram user";
  const avatarUrl = validatedTelegramPhotoUrl(identity.photo_url);
  const telegramId = String(identity.id);
  const profiles = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .orderBy(asc(usersTable.id));

  const existing = selectTelegramProfile(profiles, selectedUserType);

  if (existing) {
    const claimUnassignedProfile = existing.userType === null && selectedUserType !== undefined;
    const [updated] = await db
      .update(usersTable)
      .set({
        ...(claimUnassignedProfile ? { userType: selectedUserType } : {}),
        ...(avatarUrl && existing.avatarUrl !== avatarUrl ? { avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(
        claimUnassignedProfile
          ? and(eq(usersTable.id, existing.id), isNull(usersTable.userType))
          : eq(usersTable.id, existing.id),
      )
      .returning();
    if (updated) return updated;
    if (claimUnassignedProfile) return upsertTelegramUser(identity, selectedUserType);
    return existing;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      telegramId,
      name,
      // Each profile owns its public username. Do not reuse Telegram's
      // username for a second profile under the same identity.
      username: null,
      avatarUrl: avatarUrl ?? null,
      userType: selectedUserType ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // A concurrent sign-in may have created the same profile after our read.
  const [racedProfile] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .orderBy(asc(usersTable.id));
  if (racedProfile) {
    if (!selectedUserType || racedProfile.userType === selectedUserType) return racedProfile;
    const matchingProfile = await db.query.usersTable.findFirst({
      where: and(
        eq(usersTable.telegramId, telegramId),
        eq(usersTable.userType, selectedUserType),
      ),
    });
    if (matchingProfile) return matchingProfile;
  }
  throw new Error("Unable to create Telegram profile.");
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
      const user = await findUserByEmailSession(initData);
      if (!user) {
        res.status(401).json({ message: "Your email session is invalid or expired." });
        return;
      }
      (req as AuthenticatedRequest).telegramUser = user;
      next();
      return;
    }
    if (initData.startsWith("telegram_")) {
      const user = await findUserByTelegramSession(initData);
      if (!user) {
        res.status(401).json({ message: "Your Telegram session is invalid or expired." });
        return;
      }
      (req as AuthenticatedRequest).telegramUser = user;
      next();
      return;
    }
    const identity = verifyTelegramInitData(initData);
    const user = await upsertTelegramUser(identity);
    (req as AuthenticatedRequest).telegramUser = user;
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