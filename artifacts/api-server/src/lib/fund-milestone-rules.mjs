const LAMPORTS_PER_SOL = 1_000_000_000n;

export function solToLamportsExact(value) {
  const text = typeof value === "number"
    ? Number.isFinite(value) ? value.toFixed(9) : ""
    : typeof value === "string" ? value.trim() : "";
  const match = /^(\d+)(?:\.(\d{0,9}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]) * LAMPORTS_PER_SOL + BigInt((match[2] ?? "").padEnd(9, "0"));
}

export function validateFundMilestones(milestones, goalSol) {
  if (!Array.isArray(milestones) || milestones.length > 12) {
    return "Add no more than 12 fundraising checkpoints.";
  }
  const goalLamports = solToLamportsExact(goalSol);
  if (goalLamports === null || goalLamports <= 0n) {
    return "Enter a valid positive SOL goal before setting checkpoint targets.";
  }

  let previousTarget = 0n;
  for (const [index, milestone] of milestones.entries()) {
    const targetLamports = solToLamportsExact(milestone.targetSol);
    if (targetLamports === null || targetLamports <= 0n) {
      return `Enter a positive SOL target for checkpoint ${index + 1} with up to 9 decimal places.`;
    }
    if (targetLamports <= previousTarget) {
      return `Checkpoint ${index + 1} must have a higher SOL target than the previous checkpoint.`;
    }
    if (targetLamports > goalLamports) {
      return `Checkpoint ${index + 1} cannot exceed the campaign goal.`;
    }
    previousTarget = targetLamports;
  }
  return null;
}
