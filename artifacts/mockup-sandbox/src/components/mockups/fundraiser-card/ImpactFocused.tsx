import { ArrowUpRight, CalendarDays, Check, HeartHandshake, ShieldCheck } from "lucide-react";
import "./_group.css";

const fund = {
  title: "EXP Treasury Test 1",
  raisedSol: "0.000000000",
  goalSol: "100",
  contributionCount: 0,
  experienceTitle: "",
};

function getProgress() {
  const goal = Number(fund.goalSol);
  const raised = Number(fund.raisedSol);
  return Number.isFinite(goal) && goal > 0 && Number.isFinite(raised)
    ? Math.max(0, Math.min(100, (raised / goal) * 100))
    : 0;
}

function formatSol(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  if (amount === 0) return "0";
  return amount.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(amount) < 0.0001 ? 9 : 4,
  });
}

export function ImpactFocused() {
  const progress = getProgress();
  const raised = formatSol(fund.raisedSol);
  const goal = formatSol(fund.goalSol);
  const deposits = `${fund.contributionCount} verified ${fund.contributionCount === 1 ? "deposit" : "deposits"}`;
  return (
    <main className="fundraiser-mock-root">
      <button type="button" className="fundraiser-card fundraiser-card-redesign">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
          <span
            style={{
              display: "grid",
              width: 44,
              height: 44,
              flex: "0 0 auto",
              placeItems: "center",
              borderRadius: 15,
              background: "rgb(242 7 137 / 10%)",
              color: "var(--fundraiser-primary)",
            }}
          >
            <HeartHandshake size={20} strokeWidth={1.8} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
              <span style={{ color: "var(--fundraiser-primary)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" }}>
                COMMUNITY FUNDRAISER
              </span>
            </span>
            <strong style={{ display: "block", fontSize: 17, lineHeight: "22px", letterSpacing: "-0.025em" }}>
              {fund.title}
            </strong>
            {fund.experienceTitle ? (
              <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, color: "var(--fundraiser-muted-foreground)", fontSize: 11 }}>
                <CalendarDays size={12} />
                Supports {fund.experienceTitle}
              </span>
            ) : null}
          </span>
          <span
            style={{
              display: "grid",
              width: 34,
              height: 34,
              flex: "0 0 auto",
              placeItems: "center",
              border: "1px solid var(--fundraiser-border)",
              borderRadius: 12,
              background: "white",
              color: "var(--fundraiser-muted-foreground)",
            }}
          >
            <ArrowUpRight size={16} />
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 20 }}>
          <div>
            <div style={{ marginBottom: 4, color: "var(--fundraiser-muted-foreground)", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Raised so far
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <strong style={{ fontSize: 25, lineHeight: "30px", letterSpacing: "-0.04em" }}>{raised}</strong>
              <span style={{ color: "var(--fundraiser-muted-foreground)", fontSize: 12, fontWeight: 700 }}>SOL</span>
            </div>
          </div>
          <div style={{ padding: "9px 11px", border: "1px solid var(--fundraiser-border)", borderRadius: 12, background: "rgb(255 255 255 / 82%)", textAlign: "right" }}>
            <div style={{ color: "var(--fundraiser-muted-foreground)", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em" }}>GOAL</div>
            <div style={{ marginTop: 2, fontSize: 13, fontWeight: 800 }}>{goal} <span style={{ color: "var(--fundraiser-muted-foreground)", fontSize: 10 }}>SOL</span></div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="fundraiser-progress-track" role="progressbar" aria-label={`${Math.round(progress)}% of campaign goal`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <div className="fundraiser-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 11 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fundraiser-muted-foreground)", fontSize: 10, fontWeight: 600 }}>
              <ShieldCheck size={13} color="var(--fundraiser-secondary)" />
              {deposits}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 999, background: "rgb(104 5 242 / 7%)", color: "var(--fundraiser-secondary)", fontSize: 10, fontWeight: 800 }}>
              <Check size={11} />
              {Math.round(progress)}% funded
            </span>
          </div>
        </div>
      </button>
    </main>
  );
}
