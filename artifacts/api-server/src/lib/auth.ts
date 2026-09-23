import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import { usersTable, type User } from "@workspace/db/schema";
import { logger } from "./logger";

export type TelegramIdentity = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
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
  const [user] = await db
    .insert(usersTable)
    .values({
      telegramId: String(identity.id),
      name,
      username: identity.username ?? null,
    })
    .onConflictDoUpdate({
      target: usersTable.telegramId,
      set: {
        name,
        username: identity.username ?? null,
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