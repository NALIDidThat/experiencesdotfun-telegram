import crypto from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import { emailAccountsTable, usersTable, type User } from "@workspace/db/schema";
import { logger } from "./logger";

export type TelegramIdentity = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
  photo_url?: string;
};

export type EmailSignupInput = {
  name: string;
  email: string;
  password: string;
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

export async function createEmailAccount(input: EmailSignupInput): Promise<{ user: User; sessionToken: string }> {
  const email = normalizeEmail(input.email);
  const existing = await db.query.emailAccountsTable.findFirst({
    where: eq(emailAccountsTable.email, email),
  });
  if (existing) throw new Error("EMAIL_ALREADY_REGISTERED");

  const [user] = await db
    .insert(usersTable)
    .values({
      telegramId: `email:${crypto.randomUUID()}`,
      name: input.name.trim(),
      username: null,
    })
    .returning();
  if (!user) throw new Error("Unable to create email user.");

  const [account] = await db
    .insert(emailAccountsTable)
    .values({
      userId: user.id,
      email,
      passwordHash: hashPassword(input.password),
    })
    .returning();
  if (!account) throw new Error("Unable to create email account.");

  return { user, sessionToken: await issueEmailSession(user.id, account.id) };
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

export function verifyTelegramInitData(initData: string): TelegramIdentity {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Telegram init data is missing its hash.");

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(getBotToken())
    .digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const provided = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    throw new Error("Telegram init data signature is invalid.");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 86_400) {
    throw new Error("Telegram init data has expired.");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram init data is missing its user.");
  const telegramUser = JSON.parse(rawUser) as TelegramIdentity;
  if (!Number.isSafeInteger(telegramUser.id)) {
    throw new Error("Telegram user id is invalid.");
  }
  return telegramUser;
}

export async function upsertTelegramUser(identity: TelegramIdentity): Promise<User> {
  const name = [identity.first_name, identity.last_name].filter(Boolean).join(" ") || "Telegram user";
  const avatarUrl = validatedTelegramPhotoUrl(identity.photo_url);
  const [user] = await db
    .insert(usersTable)
    .values({
      telegramId: String(identity.id),
      name,
      username: identity.username ?? null,
      avatarUrl: avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: usersTable.telegramId,
      set: {
        username: identity.username ?? null,
        ...(avatarUrl ? { avatarUrl } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!user) throw new Error("Unable to create Telegram user.");
  return user;
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

export async function findUserByTelegramId(telegramId: number): Promise<User | undefined> {
  return db.query.usersTable.findFirst({
    where: eq(usersTable.telegramId, String(telegramId)),
  });
}

export async function findUserByUsername(username: string): Promise<User | undefined> {
  const normalized = username.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(normalized)) return undefined;
  return db.query.usersTable.findFirst({
    where: sql`lower(${usersTable.username}) = ${normalized.toLowerCase()}`,
  });
}