import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { CreateAccountProfileBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { currentUser, issueProfileSession, requireTelegramUser } from "../lib/auth";
import { userResponse } from "../lib/data";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use(requireTelegramUser);

router.get("/", async (req, res) => {
  const owner = currentUser(req);
  const profiles = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, owner.telegramId))
    .orderBy(asc(usersTable.createdAt), asc(usersTable.id));
  res.json({ accounts: await Promise.all(profiles.map(userResponse)) });
});

router.post("/", async (req, res) => {
  const parsed = CreateAccountProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a Participant or Organisation profile." });
    return;
  }

  const owner = currentUser(req);
  try {
    const [profile] = await db
      .insert(usersTable)
      .values({
        telegramId: owner.telegramId,
        name: owner.name,
        username: null,
        avatarUrl: owner.avatarUrl,
        userType: parsed.data.userType,
      })
      .returning();
    if (!profile) throw new Error("Unable to create profile.");

    const sessionToken = await issueProfileSession(req, profile);
    res.status(201).json({
      user: await userResponse(profile),
      isNew: true,
      sessionToken,
    });
  } catch (error) {
    logger.error({ err: error }, "Account profile creation failed");
    res.status(500).json({ message: "We couldn't create the profile. Please try again." });
  }
});

router.post("/:accountId/activate", async (req, res) => {
  const accountId = Number(req.params.accountId);
  if (!Number.isSafeInteger(accountId) || accountId < 1) {
    res.status(400).json({ message: "Choose a valid profile." });
    return;
  }

  const owner = currentUser(req);
  const profile = await db.query.usersTable.findFirst({
    where: and(
      eq(usersTable.id, accountId),
      eq(usersTable.telegramId, owner.telegramId),
    ),
  });
  if (!profile) {
    res.status(404).json({ message: "That profile is not available under this login." });
    return;
  }

  const sessionToken = await issueProfileSession(req, profile);
  res.json({
    user: await userResponse(profile),
    isNew: false,
    sessionToken,
  });
});

export default router;