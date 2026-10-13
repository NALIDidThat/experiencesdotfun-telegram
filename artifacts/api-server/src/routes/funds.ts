import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db,
  organisationFundsTable,
  organisationsTable,
  usersTable,
} from "@workspace/db";
import { currentUser, requireTelegramUser } from "../lib/auth";

const router: IRouter = Router();
const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function isSolanaPublicKey(address: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
  let value = 0n;
  for (const character of address) value = value * 58n + BigInt(base58.indexOf(character));
  const bytes = value === 0n ? 0 : Math.ceil(value.toString(16).length / 2);
  const leadingZeroBytes = address.match(/^1*/)?.[0].length ?? 0;
  return bytes + leadingZeroBytes === 32;
}
const walletAddressSchema = z.string().refine(isSolanaPublicKey, "Enter a valid Solana wallet address.");
const createFundSchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(600),
  walletAddress: walletAddressSchema,
  goalSol: z.number().positive().max(1_000_000_000).refine((value) => Number.isFinite(value) && Number(value.toFixed(9)) === value),
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
  const rows = await db.select({ fund: organisationFundsTable, organisation: organisationsTable })
    .from(organisationFundsTable)
    .innerJoin(organisationsTable, eq(organisationFundsTable.organisationId, organisationsTable.id))
    .where(and(
      eq(organisationsTable.ownerUserId, userId),
      eq(organisationsTable.organisationType, "charity"),
      eq(organisationFundsTable.status, "active"),
    ))
    .orderBy(desc(organisationFundsTable.createdAt), desc(organisationFundsTable.id));
  res.json(rows.map(({ fund, organisation }) => ({
    id: fund.id,
    organisationId: organisation.id,
    organisationUserId: userId,
    organisationName: organisation.name,
    title: fund.title,
    description: fund.description,
    walletAddress: fund.walletAddress,
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
  if (!organisation) {
    res.status(403).json({ message: "Only charity organisation profiles can launch funds." });
    return;
  }
  const [fund] = await db.insert(organisationFundsTable).values({
    organisationId: organisation.id,
    createdByUserId: user.id,
    ...parsed.data,
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
    goalSol: Number(fund.goalSol),
    status: fund.status,
    createdAt: fund.createdAt.toISOString(),
  });
});

export default router;
