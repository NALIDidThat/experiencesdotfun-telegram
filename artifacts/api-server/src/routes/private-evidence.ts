import { and, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "@workspace/db";
import {
  experienceMilestoneSubmissionsTable,
  experienceMilestonesTable,
  experiencesTable,
  organisationVerificationApplicationsTable,
  organisationsTable,
  participationsTable,
  usersTable,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { getSupabaseAdminClient } from "../lib/supabase";
import { hasSameTelegramIdentity } from "../lib/telegram-identity";
import {
  isVerificationReviewer,
  isVerificationSelfReview,
} from "../lib/organisation-verification-rules.mjs";

const router = Router();
const BUCKET = "verification-evidence";
const MAX_BYTES = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function matchesImageSignature(contentType: string, bytes: Buffer): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return contentType === "image/webp" &&
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
}

router.use("/evidence", requireTelegramUser);

router.post("/evidence/upload", async (req, res) => {
  const { contentType, data, purpose } = req.body ?? {};
  if (
    typeof contentType !== "string" ||
    !allowedTypes.has(contentType) ||
    typeof data !== "string" ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data) ||
    (purpose !== undefined && purpose !== "evidence" && purpose !== "memory")
  ) {
    res.status(400).json({ message: "Upload a JPEG, PNG, or WebP evidence image." });
    return;
  }
  const bytes = Buffer.from(data, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_BYTES ||
    bytes.toString("base64") !== data ||
    !matchesImageSignature(contentType, bytes)
  ) {
    res.status(413).json({ message: "Evidence images must be 4 MB or smaller." });
    return;
  }
  const user = currentUser(req);
  const storage = getSupabaseAdminClient().storage;
  const path = purpose === "memory"
    ? `${user.id}/memories/${crypto.randomUUID()}`
    : `${user.id}/${crypto.randomUUID()}`;
  try {
    const existingBucket = await storage.getBucket(BUCKET);
    if (existingBucket.error) {
      const created = await storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: [...allowedTypes],
      });
      if (created.error && !/already exists/i.test(created.error.message)) {
        res.status(503).json({ message: "Private evidence storage is unavailable." });
        return;
      }
    } else if (existingBucket.data.public) {
      res.status(503).json({ message: "Private evidence storage is not configured as private." });
      return;
    }
    const result = await storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (result.error) {
      res.status(503).json({ message: "Private evidence storage is unavailable." });
      return;
    }
    res.status(201).json({ objectKey: path });
  } catch {
    res.status(503).json({ message: "Private evidence storage is unavailable." });
  }
});

router.post("/evidence/access", async (req, res) => {
  const key = typeof req.body?.objectKey === "string" ? req.body.objectKey : "";
  const user = currentUser(req);
  if (!key || key.length > 200 || key.includes("..") || key.startsWith("/")) {
    res.status(400).json({ message: "Evidence file not found." });
    return;
  }
  const containsKey = (column: any) => sql`${column} @> ${JSON.stringify([key])}::jsonb`;
  const reviewerId = process.env.VERIFICATION_REVIEWER_TELEGRAM_ID;
  const isReviewer = Boolean(
    reviewerId && isVerificationReviewer(reviewerId, user.telegramId),
  );
  const [application] = await db
    .select({ applicantUserId: organisationVerificationApplicationsTable.applicantUserId })
    .from(organisationVerificationApplicationsTable)
    .where(and(
      containsKey(organisationVerificationApplicationsTable.evidenceObjectKeys),
      isReviewer
        ? sql`${organisationVerificationApplicationsTable.status} IN ('pending', 'under_review', 'needs_information')`
        : eq(organisationVerificationApplicationsTable.applicantUserId, user.id),
    ))
    .limit(1);
  const applicationApplicant = application
    ? await db.query.usersTable.findFirst({
        where: eq(usersTable.id, application.applicantUserId),
      })
    : undefined;
  const applicationIsSelfReview = Boolean(
    isReviewer &&
      application &&
      isVerificationSelfReview({
        applicantUserId: application.applicantUserId,
        reviewerUserId: user.id,
        applicantTelegramId: applicationApplicant?.telegramId,
        reviewerTelegramId: user.telegramId,
      }),
  );
  const [participation] = await db
    .select({ userId: participationsTable.userId })
    .from(participationsTable)
    .where(and(containsKey(participationsTable.evidenceObjectKeys), eq(participationsTable.userId, user.id)))
    .limit(1);
  const [milestone] = await db
    .select({ userId: participationsTable.userId })
    .from(experienceMilestoneSubmissionsTable)
    .innerJoin(participationsTable, eq(participationsTable.id, experienceMilestoneSubmissionsTable.participationId))
    .where(and(containsKey(experienceMilestoneSubmissionsTable.evidenceObjectKeys), eq(participationsTable.userId, user.id)))
    .limit(1);
  const [hostParticipation] = await db
    .select({ id: participationsTable.id, telegramId: usersTable.telegramId })
    .from(participationsTable)
    .innerJoin(usersTable, eq(usersTable.id, participationsTable.userId))
    .innerJoin(experiencesTable, eq(experiencesTable.id, participationsTable.experienceId))
    .innerJoin(organisationsTable, eq(organisationsTable.id, experiencesTable.organisationId))
    .where(and(
      containsKey(participationsTable.evidenceObjectKeys),
      eq(organisationsTable.ownerUserId, user.id),
    ))
    .limit(1);
  const [hostMilestone] = await db
    .select({ id: experienceMilestoneSubmissionsTable.id, telegramId: usersTable.telegramId })
    .from(experienceMilestoneSubmissionsTable)
    .innerJoin(experienceMilestonesTable, eq(experienceMilestonesTable.id, experienceMilestoneSubmissionsTable.milestoneId))
    .innerJoin(experiencesTable, eq(experiencesTable.id, experienceMilestonesTable.experienceId))
    .innerJoin(organisationsTable, eq(organisationsTable.id, experiencesTable.organisationId))
    .innerJoin(participationsTable, eq(participationsTable.id, experienceMilestoneSubmissionsTable.participationId))
    .innerJoin(usersTable, eq(usersTable.id, participationsTable.userId))
    .where(and(
      containsKey(experienceMilestoneSubmissionsTable.evidenceObjectKeys),
      eq(organisationsTable.ownerUserId, user.id),
    ))
    .limit(1);
  const canReviewContribution = Boolean(
    (hostParticipation && !hasSameTelegramIdentity(hostParticipation, user)) ||
    (hostMilestone && !hasSameTelegramIdentity(hostMilestone, user)),
  );
  if (
    (!application ||
      (applicationIsSelfReview && application.applicantUserId !== user.id)) &&
    !participation &&
    !milestone &&
    !canReviewContribution &&
    !key.startsWith(`${user.id}/`)
  ) {
    res.status(403).json({ message: "You cannot access this evidence file." });
    return;
  }
  const signed = await getSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(key, 60);
  if (signed.error || !signed.data?.signedUrl) {
    res.status(404).json({ message: "Evidence file not found." });
    return;
  }
  res.json({ url: signed.data.signedUrl, expiresIn: 60 });
});

export default router;
