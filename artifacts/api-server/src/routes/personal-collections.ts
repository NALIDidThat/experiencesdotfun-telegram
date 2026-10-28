import { and, desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "@workspace/db";
import {
  experiencesTable,
  organisationsTable,
  personalMemoriesTable,
  savedExperiencesTable,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { getSupabaseAdminClient } from "../lib/supabase";
import { normalizePersonalMemory } from "../lib/personal-collections-rules.mjs";

const router = Router();
const privatePhotoBucket = "verification-evidence";
const savedCategories = new Set(["personal", "professional"]);

function participantOnly(req: Parameters<typeof currentUser>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  if (currentUser(req).userType === "participant") return true;
  res.status(403).json({ message: "This collection is available to participant profiles." });
  return false;
}

async function removeUnreferencedMemoryPhotos(keys: string[], userId: number) {
  for (const key of new Set(keys)) {
    if (!key.startsWith(`${userId}/memories/`)) continue;
    try {
      const [reference] = await db
        .select({ id: personalMemoriesTable.id })
        .from(personalMemoriesTable)
        .where(and(
          eq(personalMemoriesTable.userId, userId),
          sql`${personalMemoriesTable.photoObjectKeys} @> ${JSON.stringify([key])}::jsonb`,
        ))
        .limit(1);
      if (reference) continue;
      const { error } = await getSupabaseAdminClient()
        .storage.from(privatePhotoBucket)
        .remove([key]);
      if (error) logger.warn({ code: error.name }, "A deleted memory photo could not be removed from private storage.");
    } catch {
      logger.warn("A memory photo reference could not be verified; leaving the private photo in storage.");
    }
  }
}

router.use("/me", requireTelegramUser);

router.get("/me/saved-experiences", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const user = currentUser(req);
  const saved = await db
    .select({
      id: savedExperiencesTable.id,
      experienceId: experiencesTable.id,
      category: savedExperiencesTable.category,
      savedAt: savedExperiencesTable.createdAt,
      experience: {
        id: experiencesTable.id,
        title: experiencesTable.title,
        category: experiencesTable.category,
        date: experiencesTable.date,
        city: experiencesTable.city,
        location: experiencesTable.location,
        xpReward: experiencesTable.xpReward,
        status: experiencesTable.status,
        organisationName: organisationsTable.name,
      },
    })
    .from(savedExperiencesTable)
    .innerJoin(experiencesTable, eq(experiencesTable.id, savedExperiencesTable.experienceId))
    .innerJoin(organisationsTable, eq(organisationsTable.id, experiencesTable.organisationId))
    .where(eq(savedExperiencesTable.userId, user.id))
    .orderBy(desc(savedExperiencesTable.createdAt));
  res.json(saved);
});

router.put("/me/saved-experiences", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const user = currentUser(req);
  const experienceId = Number(req.body?.experienceId);
  const category = req.body?.category;
  if (!Number.isSafeInteger(experienceId) || experienceId <= 0 || !savedCategories.has(category)) {
    res.status(400).json({ message: "Choose an experience and a Personal or Professional category." });
    return;
  }

  const [experience, existingSaved] = await Promise.all([
    db.query.experiencesTable.findFirst({
      where: eq(experiencesTable.id, experienceId),
    }),
    db.query.savedExperiencesTable.findFirst({
      where: and(
        eq(savedExperiencesTable.userId, user.id),
        eq(savedExperiencesTable.experienceId, experienceId),
      ),
    }),
  ]);
  if (!experience || (!["published", "full"].includes(experience.status) && !existingSaved)) {
    res.status(404).json({ message: "This experience is no longer available to save." });
    return;
  }

  await db
    .insert(savedExperiencesTable)
    .values({ userId: user.id, experienceId, category })
    .onConflictDoUpdate({
      target: [savedExperiencesTable.userId, savedExperiencesTable.experienceId],
      set: { category },
    });
  const [saved] = await db
    .select({
      id: savedExperiencesTable.id,
      experienceId: experiencesTable.id,
      category: savedExperiencesTable.category,
      savedAt: savedExperiencesTable.createdAt,
      experience: {
        id: experiencesTable.id,
        title: experiencesTable.title,
        category: experiencesTable.category,
        date: experiencesTable.date,
        city: experiencesTable.city,
        location: experiencesTable.location,
        xpReward: experiencesTable.xpReward,
        status: experiencesTable.status,
        organisationName: organisationsTable.name,
      },
    })
    .from(savedExperiencesTable)
    .innerJoin(experiencesTable, eq(experiencesTable.id, savedExperiencesTable.experienceId))
    .innerJoin(organisationsTable, eq(organisationsTable.id, experiencesTable.organisationId))
    .where(and(
      eq(savedExperiencesTable.userId, user.id),
      eq(savedExperiencesTable.experienceId, experienceId),
    ))
    .limit(1);
  res.json(saved);
});

router.delete("/me/saved-experiences/:experienceId", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const experienceId = Number(req.params.experienceId);
  if (!Number.isSafeInteger(experienceId) || experienceId <= 0) {
    res.status(400).json({ message: "The saved experience is invalid." });
    return;
  }
  const user = currentUser(req);
  await db
    .delete(savedExperiencesTable)
    .where(and(
      eq(savedExperiencesTable.userId, user.id),
      eq(savedExperiencesTable.experienceId, experienceId),
    ));
  res.status(204).end();
});

router.get("/me/memories", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const user = currentUser(req);
  const memories = await db
    .select()
    .from(personalMemoriesTable)
    .where(eq(personalMemoriesTable.userId, user.id))
    .orderBy(desc(personalMemoriesTable.updatedAt));
  res.json(memories);
});

router.post("/me/memories", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const user = currentUser(req);
  const normalized = normalizePersonalMemory(req.body, user.id);
  if (!normalized.ok) {
    res.status(400).json({ message: normalized.error });
    return;
  }
  const [memory] = await db
    .insert(personalMemoriesTable)
    .values({ userId: user.id, ...normalized.value })
    .returning();
  if (!memory) {
    res.status(500).json({ message: "This memory couldn’t be saved. Please try again." });
    return;
  }
  res.status(201).json(memory);
});

router.patch("/me/memories/:memoryId", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const memoryId = Number(req.params.memoryId);
  if (!Number.isSafeInteger(memoryId) || memoryId <= 0) {
    res.status(400).json({ message: "This memory is invalid." });
    return;
  }
  const user = currentUser(req);
  const existing = await db.query.personalMemoriesTable.findFirst({
    where: and(
      eq(personalMemoriesTable.id, memoryId),
      eq(personalMemoriesTable.userId, user.id),
    ),
  });
  if (!existing) {
    res.status(404).json({ message: "This memory was not found." });
    return;
  }
  const normalized = normalizePersonalMemory(req.body, user.id, existing);
  if (!normalized.ok) {
    res.status(400).json({ message: normalized.error });
    return;
  }
  const [memory] = await db
    .update(personalMemoriesTable)
    .set({ ...normalized.value, updatedAt: new Date() })
    .where(and(
      eq(personalMemoriesTable.id, memoryId),
      eq(personalMemoriesTable.userId, user.id),
    ))
    .returning();
  await removeUnreferencedMemoryPhotos(
    existing.photoObjectKeys.filter((key) => !normalized.value.photoObjectKeys.includes(key)),
    user.id,
  );
  res.json(memory);
});

router.delete("/me/memories/:memoryId", async (req, res) => {
  if (!participantOnly(req, res)) return;
  const memoryId = Number(req.params.memoryId);
  if (!Number.isSafeInteger(memoryId) || memoryId <= 0) {
    res.status(400).json({ message: "This memory is invalid." });
    return;
  }
  const user = currentUser(req);
  const [memory] = await db
    .delete(personalMemoriesTable)
    .where(and(
      eq(personalMemoriesTable.id, memoryId),
      eq(personalMemoriesTable.userId, user.id),
    ))
    .returning({ photoObjectKeys: personalMemoriesTable.photoObjectKeys });
  if (!memory) {
    res.status(404).json({ message: "This memory was not found." });
    return;
  }
  await removeUnreferencedMemoryPhotos(memory.photoObjectKeys, user.id);
  res.status(204).end();
});

export default router;
