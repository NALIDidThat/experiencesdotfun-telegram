const LAMPORTS_PER_SOL = 1_000_000_000n;

function toLamports(value) {
  const text = typeof value === "number"
    ? Number.isFinite(value) ? value.toFixed(9) : ""
    : String(value ?? "").trim();
  const match = /^(\d+)(?:\.(\d{0,9}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]) * LAMPORTS_PER_SOL + BigInt((match[2] ?? "").padEnd(9, "0"));
}

function compareDescending(left, right) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left > right ? -1 : left < right ? 1 : 0;
}

/**
 * @template {{id: number, status: string, title: string, description: string, experienceTitle: string | null, createdAt: string, raisedSol: string, goalSol: number}} T
 * @param {T[]} funds
 * @param {{filter?: "all" | "active" | "closed", query?: string, sort?: "recent" | "raised" | "progress"}} options
 * @returns {T[]}
 */
export function filterAndSortCampaigns(funds, { filter = "all", query = "", sort = "recent" } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = funds.filter((fund) => {
    if (filter !== "all" && fund.status !== filter) return false;
    if (!normalizedQuery) return true;
    return [fund.title, fund.description, fund.experienceTitle ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });

  return visible.sort((left, right) => {
    if (sort === "raised") {
      const raised = compareDescending(toLamports(left.raisedSol), toLamports(right.raisedSol));
      if (raised) return raised;
    } else if (sort === "progress") {
      const leftRaised = toLamports(left.raisedSol);
      const rightRaised = toLamports(right.raisedSol);
      const leftGoal = toLamports(left.goalSol);
      const rightGoal = toLamports(right.goalSol);
      const leftProgress = leftRaised === null || leftGoal === null || leftGoal === 0n
        ? null
        : leftRaised * rightGoal;
      const rightProgress = rightRaised === null || rightGoal === null || rightGoal === 0n
        ? null
        : rightRaised * leftGoal;
      const progress = compareDescending(leftProgress, rightProgress);
      if (progress) return progress;
    } else {
      const leftCreatedAt = Date.parse(left.createdAt);
      const rightCreatedAt = Date.parse(right.createdAt);
      const recent = compareDescending(
        Number.isFinite(leftCreatedAt) ? leftCreatedAt : null,
        Number.isFinite(rightCreatedAt) ? rightCreatedAt : null,
      );
      if (recent) return recent;
    }

    return right.id - left.id;
  });
}

/**
 * Sums verified campaign-raised SOL values without floating-point rounding.
 * @param {Array<{raisedSol: string}>} funds
 */
export function sumCampaignRaisedSol(funds) {
  let totalLamports = 0n;
  for (const fund of funds) {
    const amount = toLamports(fund.raisedSol);
    if (amount === null) return null;
    totalLamports += amount;
  }
  const whole = totalLamports / LAMPORTS_PER_SOL;
  const fraction = (totalLamports % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
