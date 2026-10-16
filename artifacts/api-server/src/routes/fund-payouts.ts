import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db, treasuryPayoutsTable as payouts, organisationTreasuriesTable as treasuries,
  organisationsTable as organisations, organisationFundsTable as funds, usersTable as users,
  experiencesTable, participationsTable,
} from "@workspace/db";
import { CreateFundPayoutBody, VerifyFundPayoutBody } from "@workspace/api-zod";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { solToLamports, readFinalizedTransfers, publicPaymentError } from "../lib/fund-payments.mjs";
import { isValidSolanaAddress, lamportsToSol } from "../lib/solana-rpc.mjs";

const router: IRouter = Router();
const signatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);
const uuid = z.string().uuid();
const verificationTimes = new Map<number, number>();
const contextQuery = () => db.select({ payout: payouts, treasury: treasuries, organisation: organisations, recipient: users })
  .from(payouts).innerJoin(treasuries, eq(payouts.treasuryId, treasuries.id))
  .innerJoin(organisations, eq(treasuries.organisationId, organisations.id))
  .innerJoin(users, eq(payouts.recipientUserId, users.id));

type PayoutContext = Awaited<ReturnType<typeof contextQuery>>[number];
function payoutJson({ payout, treasury, organisation, recipient }: PayoutContext) {
  return {
    id: payout.id, recipientUserId: payout.recipientUserId, recipientName: recipient.name,
    organisationName: organisation.name, walletAddress: payout.walletAddress, treasuryAddress: treasury.walletAddress,
    amountSol: lamportsToSol(payout.amountLamports), reason: payout.reason, fundId: payout.fundId,
    cluster: payout.cluster, memo: `Experiences.fun payout ${payout.id}`, status: payout.status,
    signature: payout.signature, createdAt: payout.createdAt.toISOString(), paidAt: payout.paidAt?.toISOString() ?? null,
    verificationMessage: payout.verificationMessage,
  };
}
async function findPayout(rawId: unknown, userId: number) {
  const parsed = uuid.safeParse(rawId);
  if (!parsed.success) return undefined;
  const [row] = await contextQuery().where(and(eq(payouts.id, parsed.data),
    or(eq(organisations.ownerUserId, userId), eq(payouts.recipientUserId, userId)))).limit(1);
  return row;
}

router.get("/payouts", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  const before = req.query.before === undefined ? undefined : await findPayout(req.query.before, user.id);
  if (req.query.before !== undefined && !before) { res.status(400).json({ message: "Invalid payout history cursor." }); return; }
  const cursor = before?.payout;
  const rows = await contextQuery().where(and(or(eq(organisations.ownerUserId, user.id), eq(payouts.recipientUserId, user.id)),
    cursor ? or(lt(payouts.createdAt, cursor.createdAt), and(eq(payouts.createdAt, cursor.createdAt), lt(payouts.id, cursor.id))) : undefined))
    .orderBy(desc(payouts.createdAt), desc(payouts.id)).limit(50);
  res.json(rows.map(payoutJson));
});

router.get("/payout-candidates", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  if (user.userType !== "organisation") { res.status(403).json({ message: "Charity profile required." }); return; }
  const [organisation] = await db.select({ id: organisations.id }).from(organisations)
    .where(and(eq(organisations.ownerUserId, user.id), eq(organisations.organisationType, "charity"))).limit(1);
  if (!organisation) { res.status(403).json({ message: "Charity profile required." }); return; }
  const rows = await db.selectDistinct({ id: users.id, name: users.name, username: users.username }).from(users)
    .innerJoin(participationsTable, eq(participationsTable.userId, users.id))
    .innerJoin(experiencesTable, eq(participationsTable.experienceId, experiencesTable.id))
    .where(and(eq(experiencesTable.organisationId, organisation.id), eq(users.userType, "participant")))
    .orderBy(users.name, users.id).limit(500);
  res.json(rows);
});
router.post("/payouts", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  const parsed = CreateFundPayoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Check the volunteer, wallet, amount and reason." }); return; }
  const data = parsed.data;
  const reason = data.reason.trim();
  if (!isValidSolanaAddress(data.walletAddress) || reason.length < 5 || reason.length > 300) {
    res.status(400).json({ message: "Enter a valid recipient wallet and a reason of 5–300 characters." }); return;
  }
  let amountLamports: string;
  try { amountLamports = solToLamports(data.amountSol); } catch (error) {
    res.status(400).json({ message: (error as Error).message }); return;
  }
  const [context] = await db.select({ treasury: treasuries, organisation: organisations }).from(treasuries)
    .innerJoin(organisations, eq(treasuries.organisationId, organisations.id))
    .where(and(eq(organisations.ownerUserId, user.id), eq(organisations.organisationType, "charity"))).limit(1);
  if (!context || user.userType !== "organisation") { res.status(403).json({ message: "Only charities with a treasury can propose volunteer payouts." }); return; }
  const [recipient] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, data.recipientUserId), eq(users.userType, "participant"))).limit(1);
  if (!recipient || data.walletAddress === context.treasury.walletAddress) {
    res.status(400).json({ message: "Select an existing participant profile and a recipient wallet different from the treasury." }); return;
  }
  if (data.fundId) {
    const [fund] = await db.select({ id: funds.id }).from(funds)
      .where(and(eq(funds.id, data.fundId), eq(funds.organisationId, context.organisation.id))).limit(1);
    if (!fund) { res.status(400).json({ message: "Select a campaign owned by this charity." }); return; }
  }
  const id = await db.transaction(async (tx) => {
    await tx.select({ id: treasuries.id }).from(treasuries).where(eq(treasuries.id, context.treasury.id)).for("update");
    const [existing] = await tx.select({ id: payouts.id }).from(payouts).where(and(
      eq(payouts.treasuryId, context.treasury.id), eq(payouts.recipientUserId, recipient.id),
      eq(payouts.walletAddress, data.walletAddress), eq(payouts.amountLamports, amountLamports),
      eq(payouts.reason, reason), eq(payouts.status, "proposed"),
      data.fundId ? eq(payouts.fundId, data.fundId) : isNull(payouts.fundId),
    )).limit(1);
    if (existing) return existing.id;
    const id = randomUUID();
    await tx.insert(payouts).values({
      id, treasuryId: context.treasury.id, fundId: data.fundId ?? null, recipientUserId: recipient.id,
      walletAddress: data.walletAddress, amountLamports, reason, cluster: context.treasury.cluster,
    });
    return id;
  });
  res.status(201).json(payoutJson((await findPayout(id, user.id))!));
});

router.post("/payouts/:payoutId/cancel", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  const context = await findPayout(req.params.payoutId, user.id);
  if (!context || context.organisation.ownerUserId !== user.id) { res.status(404).json({ message: "Payout proposal not found." }); return; }
  await db.update(payouts).set({
    status: "cancelled", verificationMessage: "Proposal dismissed. External approvals and on-chain transfers are not cancelled by this action.",
  }).where(and(eq(payouts.id, context.payout.id), eq(payouts.status, "proposed")));
  res.json(payoutJson((await findPayout(context.payout.id, user.id))!));
});

router.post("/payouts/:payoutId/verify", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  const parsed = VerifyFundPayoutBody.safeParse(req.body);
  if (!parsed.success || !signatureSchema.safeParse(parsed.data.signature).success) {
    res.status(400).json({ message: "Enter the executed Solana transaction signature." }); return;
  }
  const context = await findPayout(req.params.payoutId, user.id);
  if (!context) { res.status(404).json({ message: "Payout not found." }); return; }
  if (context.payout.status === "paid") { res.json(payoutJson(context)); return; }
  const now = Date.now();
  if (now - (verificationTimes.get(user.id) ?? 0) < 3000) { res.status(429).json({ message: "Wait a few seconds before checking again." }); return; }
  verificationTimes.set(user.id, now);
  if (verificationTimes.size > 5000) for (const [id, at] of verificationTimes) if (now - at > 60_000) verificationTimes.delete(id);
  try {
    const signature = parsed.data.signature;
    const transfers = await readFinalizedTransfers(context.payout.cluster, signature);
    const transfer = transfers.find((entry) =>
      entry.sender === context.treasury.walletAddress
      && entry.destination === context.payout.walletAddress
      && entry.amountLamports === context.payout.amountLamports
      && entry.memo === `Experiences.fun payout ${context.payout.id}`);
    if (!transfer) {
      await db.update(payouts).set({
        verificationMessage: "No finalized transfer matches this treasury, recipient, amount and proposal memo. Nothing has been marked paid.",
      }).where(and(eq(payouts.id, context.payout.id), or(eq(payouts.status, "proposed"), eq(payouts.status, "cancelled"))));
    } else {
      await db.transaction(async (tx) => {
        await tx.select({ id: treasuries.id }).from(treasuries).where(eq(treasuries.id, context.treasury.id)).for("update");
        await tx.update(payouts).set({
          status: "paid", signature, instructionIndex: transfer.instructionIndex, paidAt: transfer.blockTime ? new Date(transfer.blockTime) : new Date(),
          verificationMessage: "Finalized treasury-to-recipient SOL transfer verified. Multisig approvals remain managed externally.",
        }).where(and(eq(payouts.id, context.payout.id), or(eq(payouts.status, "proposed"), eq(payouts.status, "cancelled"))));
      });
    }
    res.json(payoutJson((await findPayout(context.payout.id, user.id))!));
  } catch (error) {
    req.log?.warn({ err: error }, "Payout verification unavailable");
    res.status(503).json({ message: publicPaymentError(error) });
  }
});
export default router;
