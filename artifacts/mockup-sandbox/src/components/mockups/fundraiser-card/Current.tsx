import { CalendarDays, ChevronRight, Heart } from "lucide-react";
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

export function Current() {
  const progress = getProgress();
  return (
    <main className="fundraiser-mock-root">
      <button type="button" className="fundraiser-card fundraiser-card-current">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span
            style={{
              display: "grid",
              width: 38,
              height: 38,
              flex: "0 0 auto",
              placeItems: "center",
              borderRadius: 13,
              background: "rgb(242 7 137 / 8%)",
              color: "var(--fundraiser-primary)",
            }}
          >
            <Heart size={17} />
          </span>
          <span style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
            <strong style={{ display: "block", fontSize: 15, lineHeight: "20px" }}>{fund.title}</strong>
            {fund.experienceTitle ? (
              <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, color: "var(--fundraiser-muted-foreground)", fontSize: 10 }}>
                <CalendarDays size={11} />
                For {fund.experienceTitle}
              </span>
            ) : null}
          </span>
          <ChevronRight size={17} color="var(--fundraiser-muted-foreground)" />
        </div>
        <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
          <div className="fundraiser-progress-track" aria-label={`${Math.round(progress)}% of campaign goal`}>
            <div className="fundraiser-progress-fill" style={{ width: `${progress}%`, background: "var(--fundraiser-primary)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 12 }}>{fund.raisedSol} SOL raised</strong>
            <span style={{ color: "var(--fundraiser-muted-foreground)", fontSize: 11 }}>{fund.goalSol} SOL goal</span>
          </div>
          <span style={{ color: "var(--fundraiser-muted-foreground)", fontSize: 10 }}>
            {fund.contributionCount} verified deposits · {Math.round(progress)}% funded
          </span>
        </div>
      </button>
    </main>
  );
}
