import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, fundContributionsTable as contributions, treasuryDepositsTable as deposits,
  organisationTreasuriesTable as treasuries, organisationFundsTable as funds, organisationsTable,
  experiencesTable, usersTable,
} from "@workspace/db";
import { lamportsToSol } from "./solana-rpc.mjs";
import { matchesPayment, paymentUri, type SolTransfer } from "./fund-payments.mjs";

export async function getFundContext(fundId: number) {
  const [row] = await db.select({
    fund: funds,
    treasury: treasuries,
    organisation: organisationsTable,
    creatorUsername: usersTable.username,
    experienceTitle: experiencesTable.title,
  })
    .from(funds).innerJoin(treasuries, eq(funds.organisationId, treasuries.organisationId))
    .innerJoin(organisationsTable, eq(funds.organisationId, organisationsTable.id))
    .innerJoin(usersTable, eq(funds.createdByUserId, usersTable.id))
    .leftJoin(experiencesTable, eq(funds.experienceId, experiencesTable.id))
    .where(eq(funds.id, fundId)).limit(1);
  return row;
}

export async function contributionJson(intent: typeof contributions.$inferSelect) {
  const context = await getFundContext(intent.fundId);
  if (!context) throw new Error("Contribution campaign is missing.");
  const [deposit] = await db.select().from(deposits).where(eq(deposits.contributionId, intent.id)).limit(1);
  const amountSol = lamportsToSol(intent.amountLamports);
  return {
    id: intent.id, fundId: intent.fundId, fundTitle: context.fund.title,
    organisationName: context.organisation.name, amountSol,
    walletAddress: context.treasury.walletAddress, cluster: context.treasury.cluster,
    reference: intent.reference,
    paymentUri: paymentUri({
      walletAddress: context.treasury.walletAddress, amountSol, reference: intent.reference,
      fundId: intent.fundId, organisationName: context.organisation.name, cluster: context.treasury.cluster,
    }),
    status: deposit ? "confirmed" : intent.status,
    signature: deposit?.signature ?? null, sender: deposit?.sender ?? null,
    createdAt: intent.createdAt.toISOString(), confirmedAt: deposit?.blockTime?.toISOString() ?? deposit?.recordedAt.toISOString() ?? null,
    lastCheckedAt: intent.lastCheckedAt?.toISOString() ?? null, verificationMessage: intent.verificationMessage,
  };
}

export async function campaignTotals(fundIds: number[]) {
  if (!fundIds.length) return new Map<number, { raisedSol: string; contributionCount: number }>();
  const totals = await db.select({
    fundId: deposits.fundId,
    amount: sql<string>`coalesce(sum(${deposits.amountLamports}), 0)::text`,
    count: sql<number>`count(*)::int`,
  }).from(deposits).where(inArray(deposits.fundId, fundIds)).groupBy(deposits.fundId);
  return new Map(totals.filter((row) => row.fundId !== null).map((row) => [
    row.fundId!, { raisedSol: lamportsToSol(row.amount), contributionCount: row.count },
  ]));
}

// Treasury lock serializes imports and verification. A transfer is unique by
// cluster/signature/instruction; a request can be credited exactly once.
export async function recordTreasuryTransfer(
  treasury: typeof treasuries.$inferSelect, signature: string, transfer: SolTransfer,
) {
  if (transfer.destination !== treasury.walletAddress) return false;
  return db.transaction(async (tx) => {
    await tx.select({ id: treasuries.id }).from(treasuries).where(eq(treasuries.id, treasury.id)).for("update");
    const candidates = transfer.references.length
      ? await tx.select({ intent: contributions }).from(contributions)
        .innerJoin(funds, eq(contributions.fundId, funds.id))
        .where(and(inArray(contributions.reference, transfer.references), eq(funds.organisationId, treasury.organisationId)))
      : [];
    const matching = candidates.map((row) => row.intent).filter((intent) => matchesPayment(transfer, {
      ...intent, walletAddress: treasury.walletAddress,
    }));
    // Multiple references matching separate requests are ambiguous, not two donations.
    const intent = matching.length === 1 ? matching[0] : undefined;
    const [alreadyCredited] = intent ? await tx.select().from(deposits).where(eq(deposits.contributionId, intent.id)) : [];
    const canCredit = intent && (!alreadyCredited || (alreadyCredited.signature === signature && alreadyCredited.instructionIndex === transfer.instructionIndex));
    const [memoFund] = transfer.campaignId
      ? await tx.select({ id: funds.id }).from(funds).where(and(eq(funds.id, transfer.campaignId), eq(funds.organisationId, treasury.organisationId)))
      : [];
    const [inserted] = await tx.insert(deposits).values({
      treasuryId: treasury.id, cluster: treasury.cluster, signature,
      instructionIndex: transfer.instructionIndex, sender: transfer.sender,
      amountLamports: transfer.amountLamports,
      contributionId: canCredit ? intent.id : null,
      fundId: canCredit ? intent.fundId : memoFund?.id ?? null,
      attribution: canCredit ? "reference" : memoFund ? "memo" : "unattributed",
      blockTime: transfer.blockTime ? new Date(transfer.blockTime) : null,
    }).onConflictDoNothing().returning({ id: deposits.id });
    const transferKey = and(
      eq(deposits.cluster, treasury.cluster), eq(deposits.signature, signature),
      eq(deposits.instructionIndex, transfer.instructionIndex), eq(deposits.treasuryId, treasury.id),
    );
    if (canCredit) {
      const [credited] = await tx.update(deposits).set({
        contributionId: intent.id, fundId: intent.fundId, attribution: "reference",
      }).where(transferKey).returning({ id: deposits.id });
      if (credited) await tx.update(contributions).set({
        status: "confirmed", lastCheckedAt: new Date(), verificationMessage: "Finalized SOL transfer verified on Solana.",
      }).where(eq(contributions.id, intent.id));
    }
    return Boolean(inserted);
  });
}

export async function fundJson(context: NonNullable<Awaited<ReturnType<typeof getFundContext>>>) {
  const { fund, treasury, organisation, creatorUsername, experienceTitle } = context;
  const totals = await campaignTotals([fund.id]);
  return {
    id: fund.id, organisationId: organisation.id, organisationUserId: organisation.ownerUserId,
    organisationName: organisation.name, creatorUsername, title: fund.title, description: fund.description,
    experienceId: fund.experienceId, experienceTitle: experienceTitle ?? null,
    walletAddress: treasury.walletAddress, cluster: treasury.cluster, goalSol: Number(fund.goalSol),
    status: fund.status, createdAt: fund.createdAt.toISOString(),
    ...(totals.get(fund.id) ?? { raisedSol: "0.000000000", contributionCount: 0 }),
  };
}
