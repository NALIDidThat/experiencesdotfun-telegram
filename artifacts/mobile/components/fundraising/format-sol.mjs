/**
 * @param {string | number} value
 * @returns {string}
 */
export function formatSol(value) {
  if (typeof value === "number" && !Number.isFinite(value)) return "0";
  const decimal = typeof value === "number" ? value.toFixed(9) : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!match) return "0";

  const fraction = match[3] ?? "";
  if (/[1-9]/.test(fraction.slice(9))) return "0";
  const whole = BigInt(`${match[1]}${match[2]}`).toLocaleString();
  const visibleFraction = fraction.slice(0, 9).replace(/0+$/, "");
  return visibleFraction ? `${whole}.${visibleFraction}` : whole;
}
