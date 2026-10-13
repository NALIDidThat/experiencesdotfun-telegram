import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db,
  organisationFundsTable,
  organisationTreasuriesTable,
  organisationsTable,
  usersTable,
} from "@workspace/db";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { canLaunchCharityFund } from "../lib/fund-rules.mjs";
import { getSolanaBalance, getSolanaTreasuryActivity, isValidSolanaAddress, lamportsToSol } from "../lib/solana-rpc.mjs";

const router: IRouter = Router();
const walletAddressSchema = z.string().refine(isValidSolanaAddress, "Enter a valid Solana wallet address.");
const clusterSchema = z.enum(["mainnet-beta", "devnet", "testnet"]);
const registerTreasurySchema = z.object({
  walletAddress: walletAddressSchema,
  cluster: clusterSchema,
});
const createFundSchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(600),
  goalSol: z.number().positive().max(1_000_000_000).refine((value) => Number.isFinite(value) && Number(value.toFixed(9)) === value),
});
const treasuryActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(20),
  before: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/).optional(),
});

async function getCharityForUser(userId: number, userType: string | null) {
  if (userType !== "organisation") return undefined;
  return db.query.organisationsTable.findFirst({
    where: and(eq(organisationsTable.ownerUserId, userId), eq(organisationsTable.organisationType, "charity")),
  });
}

function treasuryJson(treasury: typeof organisationTreasuriesTable.$inferSelect, organisationUserId: number) {
  return {
    organisationId: treasury.organisationId,
    organisationUserId,
    walletAddress: treasury.walletAddress,
    cluster: treasury.cluster,
    createdAt: treasury.createdAt.toISOString(),
    updatedAt: treasury.updatedAt.toISOString(),
  };
}

router.get("/treasury", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  const organisation = await getCharityForUser(user.id, user.userType);
  if (!organisation) {
    res.status(403).json({ message: "Only charity organisation profiles can view this treasury." });
    return;
  }
  const treasury = await db.query.organisationTreasuriesTable.findFirst({
    where: eq(organisationTreasuriesTable.organisationId, organisation.id),
  });
  if (!treasury) {
    res.status(404).json({ message: "Register a charity treasury to view its balance and activity." });
    return;
  }
  try {
    const [balanceLamports, activity] = await Promise.all([
      getSolanaBalance({ address: treasury.walletAddress, cluster: treasury.cluster }),
      getSolanaTreasuryActivity({
        address: treasury.walletAddress,
        cluster: treasury.cluster,
        limit: Number(req.query.limit ?? 20),
        before: typeof req.query.before === "string" ? req.query.before : undefined,
      }),
    ]);
    res.json({
      treasury: treasuryJson(treasury, user.id),
      balanceSol: lamportsToSol(balanceLamports),
      transactions: activity.transactions,
      nextCursor: activity.nextCursor,
      hasMore: activity.hasMore,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      message: error instanceof Error ? error.message : "The Solana network could not be reached.",
    });
  }
});

router.put("/treasury", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  const parsed = registerTreasurySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Check the treasury address and network." });
    return;
  }
  const organisation = await getCharityForUser(user.id, user.userType);
  if (!organisation) {
    res.status(403).json({ message: "Only charity organisation profiles can register a treasury." });
    return;
  }
  try {
    await getSolanaBalance({ address: parsed.data.walletAddress, cluster: parsed.data.cluster });
  } catch (error) {
    res.status(503).json({
      message: error instanceof Error ? error.message : "The treasury address could not be checked on Solana.",
    });
    return;
  }
  try {
    const existing = await db.query.organisationTreasuriesTable.findFirst({
      where: eq(organisationTreasuriesTable.organisationId, organisation.id),
    });
    if (existing) {
      if (existing.walletAddress === parsed.data.walletAddress && existing.cluster === parsed.data.cluster) {
        res.json(treasuryJson(existing, user.id));
        return;
      }
      res.status(409).json({ message: "A treasury is already registered. Changing it here could hide earlier transaction history." });
      return;
    }
    const [treasury] = await db.insert(organisationTreasuriesTable).values({
      organisationId: organisation.id,
      walletAddress: parsed.data.walletAddress,
      cluster: parsed.data.cluster,
      createdByUserId: user.id,
      updatedAt: new Date(),
    }).returning();
    res.json(treasuryJson(treasury, user.id));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "23505") {
      res.status(409).json({ message: "That public address is already registered to another charity." });
      return;
    }
    throw error;
  }
});

router.get("/:organisationUserId", async (req, res): Promise<void> => {
  const userId = Number(req.params.organisationUserId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json({ message: "Organisation profile not found." });
    return;
  }
  const [owner] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.userType, "organisation")))
    .limit(1);
  if (!owner) {
    res.status(404).json({ message: "Organisation profile not found." });
    return;
  }
  const rows = await db.select({ fund: organisationFundsTable, organisation: organisationsTable, treasury: organisationTreasuriesTable })
    .from(organisationFundsTable)
    .innerJoin(organisationsTable, eq(organisationFundsTable.organisationId, organisationsTable.id))
    .innerJoin(organisationTreasuriesTable, eq(organisationFundsTable.organisationId, organisationTreasuriesTable.organisationId))
    .where(and(
      eq(organisationsTable.ownerUserId, userId),
      eq(organisationsTable.organisationType, "charity"),
      eq(organisationFundsTable.status, "active"),
    ))
    .orderBy(desc(organisationFundsTable.createdAt), desc(organisationFundsTable.id));
  res.json(rows.map(({ fund, organisation, treasury }) => ({
    id: fund.id,
    organisationId: organisation.id,
    organisationUserId: userId,
    organisationName: organisation.name,
    title: fund.title,
    description: fund.description,
    walletAddress: treasury.walletAddress,
    cluster: treasury.cluster,
    goalSol: Number(fund.goalSol),
    status: fund.status,
    createdAt: fund.createdAt.toISOString(),
  })));
});

router.post("/", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  if (user.userType !== "organisation") {
    res.status(403).json({ message: "Only charity organisation profiles can launch funds." });
    return;
  }
  const parsed = createFundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Check the fund details." });
    return;
  }
  const [organisation] = await db.select().from(organisationsTable)
    .where(and(eq(organisationsTable.ownerUserId, user.id), eq(organisationsTable.organisationType, "charity")))
    .limit(1);
  if (!canLaunchCharityFund(user.userType, organisation?.organisationType)) {
    res.status(403).json({ message: "Only charity organisation profiles can launch funds." });
    return;
  }
  const treasury = await db.query.organisationTreasuriesTable.findFirst({
    where: eq(organisationTreasuriesTable.organisationId, organisation.id),
  });
  if (!treasury) {
    res.status(409).json({ message: "Register a charity treasury before launching a fund." });
    return;
  }
  const [fund] = await db.insert(organisationFundsTable).values({
    organisationId: organisation.id,
    createdByUserId: user.id,
    ...parsed.data,
    walletAddress: treasury.walletAddress,
    goalSol: String(parsed.data.goalSol),
  }).returning();
  res.status(201).json({
    id: fund.id,
    organisationId: organisation.id,
    organisationUserId: user.id,
    organisationName: organisation.name,
    title: fund.title,
    description: fund.description,
    walletAddress: fund.walletAddress,
    cluster: treasury.cluster,
    goalSol: Number(fund.goalSol),
    status: fund.status,
    createdAt: fund.createdAt.toISOString(),
  });
});

export default router;
