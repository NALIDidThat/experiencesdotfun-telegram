import { useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  LockKeyhole,
  Share2,
  ShieldCheck,
  Target,
} from "lucide-react";
import "./_group.css";

const fund = {
  title: "EXP Treasury Test 1",
  description: "We will build it and you will like it.",
  organisationName: "EXP Foundation",
  raisedSol: "0.000000000",
  goalSol: "100",
  contributionCount: 0,
  campaignNumber: 4,
  started: "13 Oct, 17:27",
};

const panel = {
  border: "1px solid var(--tracker-border)",
  borderRadius: 19,
  background: "var(--tracker-background)",
  padding: 15,
};

function CurrentInsights() {
  const [period, setPeriod] = useState<"all" | "month">("all");
  const checkpoints = [25, 50, 75, 100];

  return (
    <div className="current-insights">
      <section className="insight-card">
        <div className="insight-header">
          <div>
            <h2>Funding progress <BadgeCheck size={14} /></h2>
            <p>Verified campaign-linked deposits only</p>
          </div>
          <strong className="insight-percent">0%</strong>
        </div>
        <div className="progress-track" role="progressbar" aria-label="0 percent of campaign goal funded" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><span /></div>
        <div className="insight-raised-row">
          <strong>0 SOL raised</strong>
          <span>Goal · 100 SOL</span>
        </div>
        <div className="insight-stat-grid">
          <div className="insight-stat"><strong>0</strong><span>Anonymous supporters</span></div>
          <div className="insight-stat"><strong>0</strong><span>Verified deposits</span></div>
        </div>
      </section>

      <section className="insight-card">
        <div className="insight-section-heading">
          <h2>Funding milestones</h2>
          <p>Goal-based checkpoints, not real-world impact claims.</p>
        </div>
        <div className="checkpoint-list">
          {checkpoints.map((checkpoint, index) => (
            <div className="checkpoint" key={checkpoint}>
              <span className={`checkpoint-icon${index === 0 ? " checkpoint-next" : ""}`}>
                {index === 0 ? <Target size={14} /> : <Circle size={13} />}
              </span>
              <span className="checkpoint-content">
                <strong>{checkpoint}% of goal</strong>
                <small>{checkpoint} SOL checkpoint</small>
              </span>
              <span className={`checkpoint-status${index === 0 ? " checkpoint-status-next" : ""}`}>{index === 0 ? "Next checkpoint" : "Upcoming"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="insights-section">
        <div className="insight-section-heading">
          <h2>What this supports</h2>
          <p>Campaign details provided by the organiser.</p>
        </div>
        <div className="outcome-grid">
          <div className="outcome-card">
            <span className="outcome-card-label"><CheckCircle2 size={13} /> CAMPAIGN DETAIL 01</span>
            <p>{fund.description}</p>
          </div>
        </div>
        <p className="insight-disclaimer">These are organiser-provided details, not independently verified outcomes.</p>
      </section>

      <section className="insights-section">
        <div className="insight-section-heading">
          <h2>Recent contributions</h2>
          <p>Most recent verified deposits linked to this campaign.</p>
        </div>
        <div className="empty-insight">No verified campaign-linked contributions yet.</div>
      </section>

      <section className="insight-card">
        <div className="supporter-heading">
          <div>
            <h2>Top supporters</h2>
            <p>Ranked by verified campaign contributions</p>
          </div>
          <div className="supporter-count"><strong>0</strong><span>supporters</span></div>
        </div>
        <div aria-label="Top supporter time period" role="tablist" className="supporter-toggle">
          {([
            ["all", "All Time"],
            ["month", "This Month"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="empty-insight">
          <LockKeyhole size={15} />
          <strong>No supporter rankings yet</strong>
          <span>Rankings will appear after verified campaign deposits. Supporters remain anonymous.</span>
        </div>
        <p className="insight-disclaimer">Wallet identities are not shown. Only campaign-attributed deposits are included.</p>
      </section>
    </div>
  );
}

export function Current() {
  return (
    <main className="campaign-tracker-root">
      <article className="campaign-tracker-screen" style={{ display: "grid", alignContent: "start", gap: 15 }}>
        <header className="current-header">
          <div>
            <strong>Campaign tracker</strong>
            <span>Verified progress and campaign details</span>
          </div>
          <button aria-label="Back to campaign tracker" className="icon-button" type="button"><ArrowLeft size={18} /></button>
        </header>

        <section className="current-hero">
          <div className="hero-meta">
            <span className="status-pill"><i /> Active</span>
            <span className="campaign-number">Campaign #{fund.campaignNumber}</span>
          </div>
          <div className="hero-title">
            <h1>{fund.title}</h1>
            <span><BriefcaseBusiness size={14} /> {fund.organisationName}</span>
          </div>
          <div className="hero-tags">
            <span><Target size={13} /> Goal · 100 SOL</span>
            <span><CalendarDays size={13} /> Started {fund.started}</span>
          </div>
        </section>

        <CurrentInsights />

        <section className="current-treasury">
          <div className="treasury-heading">
            <span className="treasury-icon"><ShieldCheck size={16} /></span>
            <div>
              <strong>One shared charity treasury</strong>
              <p>Your transfer goes to the organisation, not a campaign-specific wallet.</p>
            </div>
          </div>
          <div className="treasury-address">
            <small>TREASURY ADDRESS</small>
            <strong>Shared organisation wallet</strong>
          </div>
          <p className="treasury-note">Raised totals count only verified payment requests and recorded deposits. Other shared-treasury transfers may not be attributable to this campaign.</p>
        </section>

        <section className="current-contribution" style={panel}>
          <h2>Make a contribution</h2>
          <div className="raised-line">
            <strong>{fund.raisedSol} SOL</strong>
            <span>raised of 100 SOL goal</span>
          </div>
          <p className="microcopy">{fund.contributionCount} recorded finalized deposits. Progress counts recorded deposits, not the treasury balance.</p>
          <div className="quick-amounts">
            <button type="button">0.1 SOL</button>
            <button type="button">0.5 SOL</button>
            <button type="button">1 SOL</button>
          </div>
          <div className="amount-row">
            <div className="amount-placeholder">Amount in SOL</div>
            <button className="primary-button" type="button">Contribute</button>
          </div>
          <p className="microcopy">You will get a payment request first. Nothing is counted until the transfer is verified on chain.</p>
          <div className="receipt-note"><Check size={14} /> Only finalized campaign-linked deposits count.</div>
        </section>

        <section className="current-management" style={panel}>
          <h2>Manage campaign</h2>
          <div className="manage-input">{fund.title}</div>
          <div className="manage-description">{fund.description}</div>
          <button className="primary-button full-button" type="button"><Check size={14} /> Save changes</button>
          <button className="secondary-button full-button" type="button"><LockKeyhole size={14} /> Close campaign</button>
          <p className="microcopy">Closing stops new contributions only. Financial history is kept and campaigns cannot be deleted.</p>
        </section>

        <footer className="current-actions">
          <button className="secondary-button" type="button"><ExternalLink size={14} /> Solscan</button>
          <button className="primary-button" type="button"><Share2 size={14} /> Share fund</button>
        </footer>
      </article>
    </main>
  );
}
