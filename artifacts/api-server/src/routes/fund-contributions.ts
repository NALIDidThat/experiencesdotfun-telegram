import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db, fundContributionsTable as contributions, treasuryDepositsTable as deposits,
  organisationFundsTable as funds, organisationFundMilestonesTable as fundMilestones,
  organisationTreasuriesTable as treasuries, organisationsTable,
} from "@workspace/db";
import { CreateFundContributionBody, UpdateOrganisationFundBody } from "@workspace/api-zod";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { validateFundMilestones } from "../lib/fund-milestone-rules.mjs";
import { createPaymentReference, solToLamports, solanaRpc, readFinalizedTransfers, matchesPayment, SolanaRpcError, publicPaymentError } from "../lib/fund-payments.mjs";
import { campaignActivity, contributionJson, fundJson, getFundContext, recordTreasuryTransfer } from "../lib/fund-ledger";
import { lamportsToSol } from "../lib/solana-rpc.mjs";

const router: IRouter = Router();
const idSchema = z.string().uuid();
const signatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);
// Bound verification/RPC work per profile without blocking ledger reads.
const checks = new Map<number, number>();
function rateLimit(userId: number) {
  const now = Date.now();
  if (now - (checks.get(userId) ?? 0) < 3000) return true;
  checks.set(userId, now);
  if (checks.size > 5000) for (const [id, at] of checks) if (now - at > 60_000) checks.delete(id);
  return false;
}
async function ownTreasury(userId: number) {
  const [row] = await db.select({ treasury: treasuries }).from(treasuries)
    .innerJoin(organisationsTable, eq(treasuries.organisationId, organisationsTable.id))
    .where(and(eq(organisationsTable.ownerUserId, userId), eq(organisationsTable.organisationType, "charity"))).limit(1);
  return row?.treasury;
}
async function ownContribution(rawId: unknown, userId: number) {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return undefined;
  return db.query.fundContributionsTable.findFirst({ where: and(eq(contributions.id, id.data), eq(contributions.donorUserId, userId)) });
}

router.get("/contributions", requireTelegramUser, async (req, res): Promise<void> => {
  const userId = currentUser(req).id;
  const before = req.query.before === undefined ? undefined : await ownContribution(req.query.before, userId);
  if (req.query.before !== undefined && !before) { res.status(400).json({ message: "Invalid contribution history cursor." }); return; }
  const rows = await db.select().from(contributions).where(and(eq(contributions.donorUserId, userId),
    before ? or(lt(contributions.createdAt, before.createdAt), and(eq(contributions.createdAt, before.createdAt), lt(contributions.id, before.id))) : undefined))
    .orderBy(desc(contributions.createdAt), desc(contributions.id)).limit(50);
  res.json(await Promise.all(rows.map(contributionJson)));
});

router.get("/campaigns/:fundId/activity/:period", async (req, res): Promise<void> => {
  const fundId = Number(req.params.fundId);
  const period = z.enum(["all", "month"]).safeParse(req.params.period);
  if (!Number.isSafeInteger(fundId) || fundId <= 0 || !period.success) {
    res.status(400).json({ message: "Invalid campaign." }); return;
  }
  const activity = await campaignActivity(fundId, period.data);
  if (!activity) { res.status(404).json({ message: "Campaign not found." }); return; }
  res.json(activity);
});

router.post("/campaigns/:fundId/contributions", requireTelegramUser, async (req, res): Promise<void> => {
  const parsed = CreateFundContributionBody.safeParse(req.body);
  const fundId = Number(req.params.fundId);
  if (!parsed.success || !Number.isSafeInteger(fundId) || fundId <= 0) {
    res.status(400).json({ message: "Check the campaign and SOL amount." }); return;
  }
  let amountLamports: string;
  try { amountLamports = solToLamports(parsed.data.amountSol); } catch (error) {
    res.status(400).json({ message: (error as Error).message }); return;
  }
  const user = currentUser(req);
  // Campaign lock makes closure vs new payment-request creation deterministic.
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select({ fund: funds }).from(funds)
      .innerJoin(organisationsTable, eq(funds.organisationId, organisationsTable.id))
      .innerJoin(treasuries, eq(funds.organisationId, treasuries.organisationId))
      .where(and(eq(funds.id, fundId), eq(organisationsTable.organisationType, "charity"))).for("update");
    const fund = row?.fund;
    if (!fund || fund.status !== "active") return undefined;
    const where = and(eq(contributions.fundId, fundId), eq(contributions.donorUserId, user.id),
      eq(contributions.amountLamports, amountLamports), eq(contributions.status, "pending"));
    const [existing] = await tx.select().from(contributions).where(where).limit(1);
    if (existing) return existing;
    const [intent] = await tx.insert(contributions).values({
      id: randomUUID(), fundId, donorUserId: user.id, amountLamports, reference: createPaymentReference(),
    }).returning();
    return intent;
  });
  if (!result) { res.status(409).json({ message: "This campaign is closed or unavailable. No payment request was created." }); return; }
  res.status(201).json(await contributionJson(result));
});

router.post("/contributions/:contributionId/cancel", requireTelegramUser, async (req, res): Promise<void> => {
  const intent = await ownContribution(req.params.contributionId, currentUser(req).id);
  if (!intent) { res.status(404).json({ message: "Contribution not found." }); return; }
  await db.update(contributions).set({
    status: "cancelled", verificationMessage: "Request dismissed. This does not cancel a wallet transaction; a late payment can still be verified.",
  }).where(and(eq(contributions.id, intent.id), eq(contributions.status, "pending")));
  const fresh = await ownContribution(intent.id, currentUser(req).id);
  res.json(await contributionJson(fresh!));
});

router.post("/contributions/:contributionId/verify", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  const intent = await ownContribution(req.params.contributionId, user.id);
  if (!intent) { res.status(404).json({ message: "Contribution not found." }); return; }
  if (intent.status === "confirmed") { res.json(await contributionJson(intent)); return; }
  if (rateLimit(user.id)) { res.status(429).json({ message: "Wait a few seconds before checking again." }); return; }
  const context = await getFundContext(intent.fundId);
  if (!context) { res.status(404).json({ message: "Campaign not found." }); return; }
  try {
    const signatures = await solanaRpc(context.treasury.cluster, "getSignaturesForAddress", [
      intent.reference, { commitment: "finalized", limit: 25 },
    ]);
    if (!Array.isArray(signatures)) throw new SolanaRpcError("Solana returned invalid payment history.");
    let found = false;
    let failed = false;
    for (const entry of signatures) {
      if (!signatureSchema.safeParse(entry.signature).success) throw new SolanaRpcError("Invalid transaction signature from Solana.");
      if (entry.err) { failed = true; continue; }
      const transfers = await readFinalizedTransfers(context.treasury.cluster, entry.signature);
      for (const transfer of transfers) {
        if (!matchesPayment(transfer, { ...intent, walletAddress: context.treasury.walletAddress })) continue;
        await recordTreasuryTransfer(context.treasury, entry.signature, transfer);
        const fresh = await ownContribution(intent.id, user.id);
        if (fresh?.status === "confirmed") found = true;
      }
      if (found) break;
    }
    if (!found) await db.update(contributions).set({
      lastCheckedAt: new Date(),
      verificationMessage: failed
        ? "A failed transaction was found. No matching finalized payment has been credited. Check your wallet before retrying."
        : "No matching finalized payment yet. Check the network, amount and payment reference. Finalization can take a minute.",
    }).where(and(eq(contributions.id, intent.id), sql`${contributions.status} <> 'confirmed'`));
    res.json(await contributionJson((await ownContribution(intent.id, user.id))!));
  } catch (error) {
    req.log?.warn({ err: error }, "Contribution verification unavailable");
    res.status(503).json({ message: publicPaymentError(error) });
  }
});

router.get("/ledger", requireTelegramUser, async (req, res): Promise<void> => {
  const treasury = await ownTreasury(currentUser(req).id);
  if (!treasury) { res.status(403).json({ message: "A registered charity treasury is required." }); return; }
  const before = req.query.before === undefined ? undefined : Number(req.query.before);
  if (before !== undefined && (!Number.isSafeInteger(before) || before <= 0)) {
    res.status(400).json({ message: "Invalid ledger cursor." }); return;
  }
  const rows = await db.select({ deposit: deposits, fundTitle: funds.title }).from(deposits)
    .leftJoin(funds, eq(deposits.fundId, funds.id))
    .where(and(eq(deposits.treasuryId, treasury.id), before ? lt(deposits.id, before) : undefined))
    .orderBy(desc(deposits.id)).limit(51);
  const [total] = await db.select({
    amount: sql<string>`coalesce(sum(${deposits.amountLamports}),0)::text`,
    unattributed: sql<string>`coalesce(sum(case when ${deposits.fundId} is null then ${deposits.amountLamports} else 0 end),0)::text`,
  }).from(deposits).where(eq(deposits.treasuryId, treasury.id));
  res.json({
    entries: rows.slice(0, 50).map(({ deposit, fundTitle }) => ({
      id: deposit.id, fundId: deposit.fundId, fundTitle, amountSol: lamportsToSol(deposit.amountLamports),
      cluster: deposit.cluster, signature: deposit.signature, sender: deposit.sender, attribution: deposit.attribution,
      blockTime: deposit.blockTime?.toISOString() ?? null, recordedAt: deposit.recordedAt.toISOString(),
    })),
    nextCursor: rows.length > 50 ? rows[49].deposit.id : null,
    totalSol: lamportsToSol(total.amount), unattributedSol: lamportsToSol(total.unattributed),
    lastSyncedAt: treasury.lastSyncedAt?.toISOString() ?? null, historyComplete: treasury.historyComplete,
    historyCursor: treasury.historyCursor,
  });
});

router.post("/ledger/sync", requireTelegramUser, async (req, res): Promise<void> => {
  const user = currentUser(req);
  const treasury = await ownTreasury(user.id);
  if (!treasury) { res.status(403).json({ message: "A registered charity treasury is required." }); return; }
  const parsed = z.object({ before: signatureSchema.optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid history cursor." }); return; }
  if (parsed.data.before && parsed.data.before !== treasury.historyCursor) {
    res.status(409).json({ message: "History changed. Refresh the ledger before importing older transfers." }); return;
  }
  if (rateLimit(user.id)) { res.status(429).json({ message: "Wait a few seconds before syncing again." }); return; }
  try {
    const signatures = await solanaRpc(treasury.cluster, "getSignaturesForAddress", [
      treasury.walletAddress, { commitment: "finalized", limit: 20, ...(parsed.data.before ? { before: parsed.data.before } : {}) },
    ]);
    if (!Array.isArray(signatures)) throw new SolanaRpcError("Solana returned invalid treasury history.");
    let imported = 0;
    for (let start = 0; start < signatures.length; start += 4) {
      const batch = await Promise.all(signatures.slice(start, start + 4).map(async (entry) => {
        if (!signatureSchema.safeParse(entry.signature).success) throw new SolanaRpcError("Invalid Solana transaction signature.");
        return { signature: entry.signature, transfers: entry.err ? [] : await readFinalizedTransfers(treasury.cluster, entry.signature) };
      }));
      for (const entry of batch) for (const transfer of entry.transfers) {
        if (await recordTreasuryTransfer(treasury, entry.signature, transfer)) imported++;
      }
    }
    const hasMore = signatures.length === 20;
    const nextCursor = hasMore ? signatures.at(-1).signature as string : null;
    const checkedAt = new Date();
    // A latest refresh restarts the contiguous scan, so a burst of more than one
    // page of new transfers can never leave an unscanned gap labelled complete.
    const updated = await db.update(treasuries).set({
      lastSyncedAt: checkedAt,
      historyComplete: !hasMore, historyCursor: nextCursor,
    }).where(and(
      eq(treasuries.id, treasury.id),
      treasury.lastSyncedAt ? eq(treasuries.lastSyncedAt, treasury.lastSyncedAt) : isNull(treasuries.lastSyncedAt),
      treasury.historyCursor ? eq(treasuries.historyCursor, treasury.historyCursor) : isNull(treasuries.historyCursor),
    )).returning({ id: treasuries.id });
    if (!updated.length) {
      res.status(409).json({ message: "Another treasury sync finished first. Imported entries are safe. Refresh the ledger before continuing." }); return;
    }
    res.json({ imported, nextCursor, hasMore, checkedAt: checkedAt.toISOString() });
  } catch (error) {
    req.log?.warn({ err: error }, "Treasury ledger sync unavailable");
    res.status(503).json({ message: publicPaymentError(error) });
  }
});

router.patch("/campaigns/:fundId", requireTelegramUser, async (req, res): Promise<void> => {
  const fundId = Number(req.params.fundId);
  const parsed = UpdateOrganisationFundBody.safeParse(req.body);
  if (!parsed.success || !Number.isSafeInteger(fundId) || fundId <= 0) {
    res.status(400).json({ message: "Check the campaign details." }); return;
  }
  const context = await getFundContext(fundId);
  if (!context || context.organisation.ownerUserId !== currentUser(req).id || context.organisation.organisationType !== "charity") {
    res.status(404).json({ message: "Campaign not found." }); return;
  }
  const details = z.object({
    title: z.string().trim().min(3).max(80).optional(), description: z.string().trim().min(10).max(600).optional(),
    goalSol: z.number().positive().max(1_000_000_000).refine((value) => Number.isFinite(value) && Number(value.toFixed(9)) === value).optional(),
    status: z.enum(["active", "closed"]).optional(),
  }).safeParse(parsed.data);
  if (!details.success || !Object.keys(details.data).length) { res.status(400).json({ message: "Provide valid campaign changes." }); return; }
  const { goalSol, ...detailsToUpdate } = details.data;
  if (goalSol !== undefined) {
    const existingMilestones = await db.select({ targetSol: fundMilestones.targetSol }).from(fundMilestones)
      .where(eq(fundMilestones.fundId, fundId))
      .orderBy(fundMilestones.position);
    const milestoneError = validateFundMilestones(existingMilestones, goalSol);
    if (milestoneError) { res.status(400).json({ message: milestoneError }); return; }
  }
  await db.update(funds).set({
    ...detailsToUpdate,
    ...(goalSol === undefined ? {} : { goalSol: String(goalSol) }),
  }).where(eq(funds.id, fundId));
  res.json(await fundJson((await getFundContext(fundId))!));
});

export default router;
