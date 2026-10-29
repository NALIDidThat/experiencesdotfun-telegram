import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Eye,
  Heart,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Send,
  ShieldCheck,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import "./_group.css";

type Commitment = {
  title: string;
  person: "You" | "Jamie";
  progress: number;
  target: number;
  due: string;
  detail: string;
};

const initialCommitments: Commitment[] = [
  {
    title: "Take a 20-minute walk",
    person: "You",
    progress: 2,
    target: 3,
    due: "Today",
    detail: "A little fresh air between work and dinner.",
  },
  {
    title: "Finish the workshop outline",
    person: "Jamie",
    progress: 1,
    target: 2,
    due: "Fri, 14 Jun",
    detail: "One focused hour to shape the first draft.",
  },
];

export function Redesigned() {
  const [commitments, setCommitments] = useState(initialCommitments);
  const [didCheckIn, setDidCheckIn] = useState(false);
  const [encouragementOpen, setEncouragementOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [unread, setUnread] = useState(true);
  const [endConfirm, setEndConfirm] = useState(false);
  const [partnerAction, setPartnerAction] = useState<"message" | "change" | null>(null);

  const shareEncouragement = (message: string) => {
    setEncouragementOpen(false);
    setNotice(`Illustrative prototype: “${message}” is ready to send to Jamie.`);
  };

  const recordCheckIn = () => {
    if (didCheckIn) return;
    setDidCheckIn(true);
    setCommitments((current) =>
      current.map((item) =>
        item.person === "You"
          ? { ...item, progress: Math.min(item.target, item.progress + 1) }
          : item,
      ),
    );
    setNotice("Illustrative check-in recorded. It is self-reported and does not award XP.");
  };

  return (
    <main className="ap-redesign">
      <div className="ap-shell">
        <header className="ap-topbar">
          <button className="ap-back" aria-label="Back" onClick={() => setNotice("Back navigation is represented in this prototype.")}>
            <ArrowLeft size={19} />
          </button>
          <div className="ap-topbar-copy">
            <span className="ap-eyebrow">EXPERIENCES.FUN</span>
            <h1>Accountability</h1>
          </div>
          <button className={`ap-bell ${unread ? "has-unread" : ""}`} aria-label="Mark notifications as read" onClick={() => { setUnread(false); setNotice("Notifications marked as read."); }}>
            <Bell size={19} />
            {unread && <span className="ap-bell-dot" />}
          </button>
        </header>

        <div className="ap-prototype-note">
          <span className="ap-prototype-dot" />
          Prototype view · illustrative people and progress
        </div>

        {notice && (
          <div className="ap-notice" role="status">
            <CheckCircle2 size={16} />
            <span>{notice}</span>
            <button aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={15} /></button>
          </div>
        )}

        <section className="ap-intro">
          <span className="ap-kicker">YOUR SHARED SPACE</span>
          <h2>Small steps.<br /><em>In good company.</em></h2>
          <p>Keep the promises you make to yourself, with someone in your corner.</p>
        </section>

        <section className="ap-partner-panel" aria-labelledby="partner-heading">
          <div className="ap-partner-topline">
            <span className="ap-section-label" id="partner-heading">Your partner</span>
            <span className="ap-active"><span /> Active</span>
          </div>
          <div className="ap-pair">
            <div className="ap-person">
              <div className="ap-avatar ap-avatar-you">A</div>
              <strong>You</strong>
            </div>
            <div className="ap-pair-thread" aria-hidden="true"><span /><Heart size={15} fill="currentColor" /><span /></div>
            <div className="ap-person">
              <div className="ap-avatar ap-avatar-jamie">J</div>
              <strong>Jamie</strong>
            </div>
          </div>
          <div className="ap-partner-meta">
            <span>@jamie</span><i /> Partners since 27 May
          </div>
          <div className="ap-privacy">
            <span className="ap-privacy-icon"><Eye size={17} /></span>
            <div>
              <strong>Here to support, never to watch.</strong>
              <p>Check-ins are self-reported unless your partner confirms them. Your progress is shared with Jamie, not a scorecard.</p>
            </div>
          </div>
          <button className="ap-encourage" onClick={() => setEncouragementOpen((open) => !open)}>
            <Heart size={16} />
            Send a little encouragement
            <MoreHorizontal size={17} className="ap-encourage-more" />
          </button>
          {encouragementOpen && (
            <div className="ap-encourage-options">
              {["Proud of you", "Keep going", "Let’s do this"].map((item) => (
                <button key={item} onClick={() => shareEncouragement(item)}>{item}<Send size={13} /></button>
              ))}
            </div>
          )}
        </section>

        <section className="ap-goals-unavailable" aria-label="Goal tracking unavailable">
          <div className="ap-goal-mark"><Target size={18} /></div>
          <div className="ap-goal-copy">
            <div className="ap-goal-heading"><strong>Goals</strong><span>Not available yet</span></div>
            <p>Goal tracking is paused while its database update is prepared. Your partner and shared commitments are still here.</p>
          </div>
        </section>

        <section className="ap-section ap-today">
          <div className="ap-section-head">
            <div>
              <span className="ap-kicker">A NEXT STEP FOR YOU</span>
              <h2>Today, at your pace</h2>
            </div>
            <span className="ap-date"><CalendarDays size={14} /> TODAY</span>
          </div>
          <div className="ap-today-card">
            <div className="ap-today-copy">
              <span className="ap-small-label">YOUR COMMITMENT</span>
              <h3>Take a 20-minute walk</h3>
              <p>Two check-ins down. One more whenever it fits your day.</p>
            </div>
            <div className="ap-progress-row">
              <div className="ap-progress-track"><span style={{ width: `${Math.min(100, ((commitments[0].progress) / commitments[0].target) * 100)}%` }} /></div>
              <span>{commitments[0].progress} of {commitments[0].target}</span>
            </div>
            <button className={`ap-checkin-button ${didCheckIn ? "is-done" : ""}`} onClick={recordCheckIn}>
              {didCheckIn ? <CheckCircle2 size={17} /> : <Check size={17} />}
              {didCheckIn ? "Check-in noted" : "I did it"}
            </button>
            <p className="ap-xp-note"><ShieldCheck size={14} /> Manual check-ins are self-reported and do not award XP.</p>
          </div>
          <div className="ap-confirmation-hint">
            <CircleDashed size={16} />
            <span><strong>Partner confirmation</strong> Jamie can confirm a check-in from their side.</span>
          </div>
        </section>

        <section className="ap-section ap-commitments">
          <div className="ap-section-head">
            <div>
              <span className="ap-kicker">MADE TOGETHER</span>
              <h2>Shared commitments</h2>
            </div>
            <button className="ap-add-button" onClick={() => setNotice("Adding a shared commitment is available in the full Experiences.fun app.")}><Plus size={16} /> Add</button>
          </div>
          <p className="ap-section-desc">Plans for showing up in the real world, one step at a time.</p>
          <div className="ap-commitment-list">
            {commitments.map((item, index) => {
              const percent = Math.min(100, (item.progress / item.target) * 100);
              return (
                <article className="ap-commitment" key={item.title}>
                  <div className={`ap-commitment-index ${index === 0 ? "tone-mint" : "tone-peach"}`}>0{index + 1}</div>
                  <div className="ap-commitment-main">
                    <div className="ap-commitment-titleline">
                      <h3>{item.title}</h3>
                      <span className="ap-count">{item.progress}/{item.target}</span>
                    </div>
                    <p>{item.detail}</p>
                    <div className="ap-commitment-meta">
                      <span>{item.person === "You" ? "For you" : "For Jamie"}</span><i />
                      <span>Due {item.due}</span>
                    </div>
                    <div className="ap-commitment-track"><span style={{ width: `${percent}%` }} /></div>
                    {item.person === "Jamie" ? (
                      <span className="ap-checkin-status"><CheckCircle2 size={13} /> Partner checked in · awaiting your confirmation</span>
                    ) : (
                      <button className="ap-inline-checkin" onClick={recordCheckIn}><Check size={13} /> {didCheckIn ? "Checked in" : "Check in"}</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="ap-activity-section">
          <div className="ap-section-head">
            <div>
              <span className="ap-kicker">A NOTE FROM JAMIE</span>
              <h2>Partner activity</h2>
            </div>
            <Activity size={19} className="ap-activity-icon" />
          </div>
          <article className="ap-activity-item">
            <div className="ap-activity-avatar">J</div>
            <div className="ap-activity-content">
              <p><strong>Jamie checked in</strong> on the workshop outline.</p>
              <span>Self-reported · Today, 9:14 am</span>
              <button className="ap-confirm-button" onClick={() => setNotice("Illustrative prototype: Jamie’s check-in is confirmed.")}><Check size={14} /> Confirm check-in</button>
            </div>
          </article>
          <div className="ap-notification">
            <div className={`ap-notification-mark ${unread ? "unread" : ""}`}><Bell size={15} /></div>
            <div className="ap-notification-content">
              <strong>{unread ? "A gentle nudge from Jamie" : "Notification"}</strong>
              <p>“One step at a time. You’ve got this.”</p>
              <span>Today</span>
            </div>
            {unread && <button aria-label="Mark notification as read" onClick={() => { setUnread(false); setNotice("Notification marked as read."); }}><Check size={15} /></button>}
          </div>
        </section>

        <section className="ap-message-panel">
          <div className="ap-message-deco"><MessageCircle size={21} /></div>
          <div className="ap-message-copy">
            <span className="ap-kicker">KEEP IT HUMAN</span>
            <h2>Progress is better<br />with a kind word.</h2>
            <p>Say hello, share a thought, or make a plan together.</p>
          </div>
          <button onClick={() => setPartnerAction("message")}>Message Jamie <ArrowUpRight size={16} /></button>
        </section>

        <section className="ap-partner-settings">
          <div className="ap-settings-heading">
            <span className="ap-kicker">YOUR PARTNERSHIP</span>
            <h2>Choose what works for you.</h2>
          </div>
          <button className="ap-settings-action" onClick={() => setPartnerAction("change")}>
            <span className="ap-settings-icon"><UsersRound size={17} /></span>
            <span><strong>Change partner</strong><small>End this partnership before inviting someone else.</small></span>
            <ChevronRight size={17} />
          </button>
          <button className="ap-settings-action ap-end-action" onClick={() => setEndConfirm(true)}>
            <span className="ap-settings-icon"><X size={17} /></span>
            <span><strong>End partnership</strong><small>You can choose to invite someone again later.</small></span>
            <ChevronRight size={17} />
          </button>
          <div className="ap-trust-footer">
            <LockKeyhole size={16} />
            <p><strong>Your trust comes first.</strong> Your shared space is for encouragement and honest check-ins—not monitoring. Manual check-ins never award XP.</p>
          </div>
        </section>

        <footer className="ap-footer">A shared intention is a good place to begin.</footer>
      </div>

      {(endConfirm || partnerAction) && (
        <div className="ap-modal-backdrop" role="presentation" onClick={() => { setEndConfirm(false); setPartnerAction(null); }}>
          <section className="ap-modal" role="dialog" aria-modal="true" aria-labelledby="ap-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="ap-modal-close" aria-label="Close dialog" onClick={() => { setEndConfirm(false); setPartnerAction(null); }}><X size={18} /></button>
            {endConfirm ? (
              <>
                <span className="ap-modal-icon"><UsersRound size={20} /></span>
                <span className="ap-kicker">PARTNERSHIP SETTINGS</span>
                <h2 id="ap-modal-title">End this partnership?</h2>
                <p>This ends the active partnership with Jamie. Your shared space will no longer be active.</p>
                <button className="ap-modal-primary" onClick={() => { setEndConfirm(false); setNotice("End partnership is shown here as a prototype action; no account changes were made."); }}>Continue to end partnership</button>
                <button className="ap-modal-cancel" onClick={() => setEndConfirm(false)}>Keep partnership</button>
              </>
            ) : partnerAction === "change" ? (
              <>
                <span className="ap-modal-icon"><UsersRound size={20} /></span>
                <span className="ap-kicker">PARTNERSHIP SETTINGS</span>
                <h2 id="ap-modal-title">Change your partner</h2>
                <p>To choose someone new, end your current partnership first. Jamie must accept before you can share commitments with a new partner.</p>
                <button className="ap-modal-primary" onClick={() => { setPartnerAction(null); setEndConfirm(true); }}>Review ending partnership</button>
                <button className="ap-modal-cancel" onClick={() => setPartnerAction(null)}>Not now</button>
              </>
            ) : (
              <>
                <span className="ap-modal-icon"><MessageCircle size={20} /></span>
                <span className="ap-kicker">MESSAGE PARTNER</span>
                <h2 id="ap-modal-title">Say hello to Jamie</h2>
                <p>Open your conversation with Jamie to send a message. This prototype does not connect to messaging.</p>
                <button className="ap-modal-primary" onClick={() => { setPartnerAction(null); setNotice("Message partner selected. Conversation is not connected in this prototype."); }}>Open conversation <ArrowUpRight size={15} /></button>
                <button className="ap-modal-cancel" onClick={() => setPartnerAction(null)}>Close</button>
              </>
            )}
          </section>
        </div>
      )}

      <style>{`
        .ap-redesign {
          --ap-ink: #203c3a;
          --ap-muted: #647976;
          --ap-line: #dce7df;
          --ap-paper: #f5f7ed;
          --ap-card: #fffef8;
          --ap-teal: #17665f;
          --ap-pink: #c85769;
          min-height: 100vh;
          padding: 0 17px 30px;
          color: var(--ap-ink);
          background:
            radial-gradient(ellipse at 93% 1%, rgba(215, 231, 190, .48), transparent 33%),
            var(--ap-paper);
          font-family: "DM Sans", "Avenir Next", sans-serif;
        }
        .ap-shell { width: min(100%, 470px); margin: 0 auto; }
        .ap-topbar { display:flex; align-items:center; gap:12px; padding:18px 0 12px; }
        .ap-back,.ap-bell { display:grid; place-items:center; width:40px; height:40px; flex:0 0 auto; border:1px solid var(--ap-line); border-radius:14px; color:var(--ap-ink); background:rgba(255,254,248,.78); cursor:pointer; }
        .ap-back { border-color:transparent; background:transparent; margin-left:-7px; }
        .ap-topbar-copy { flex:1; }
        .ap-topbar-copy h1 { margin:2px 0 0; font-size:18px; line-height:22px; letter-spacing:-.45px; font-weight:700; }
        .ap-eyebrow,.ap-kicker { color:var(--ap-teal); font-size:9px; line-height:1.3; font-weight:800; letter-spacing:1.3px; }
        .ap-bell { position:relative; }
        .ap-bell-dot,.ap-prototype-dot,.ap-active span { width:7px; height:7px; border-radius:50%; background:#c85769; }
        .ap-bell-dot { position:absolute; top:8px; right:8px; border:1px solid #fffef8; }
        .ap-prototype-note { display:flex; align-items:center; gap:7px; padding:9px 11px; border-radius:10px; background:#e9efe0; color:#63736b; font-size:10px; letter-spacing:.1px; }
        .ap-prototype-dot { width:6px; height:6px; background:#b77d35; }
        .ap-notice { display:flex; align-items:flex-start; gap:9px; margin-top:11px; padding:11px 12px; border:1px solid #c9ddd1; border-radius:12px; color:#245a52; background:#edf6ed; font-size:11px; line-height:16px; }
        .ap-notice>svg { flex:0 0 auto; margin-top:1px; }
        .ap-notice span { flex:1; }
        .ap-notice button { display:grid; place-items:center; padding:0; border:0; color:inherit; background:none; cursor:pointer; }
        .ap-intro { padding:28px 1px 24px; }
        .ap-intro h2 { margin:9px 0 9px; font-family:Georgia, "Times New Roman", serif; font-size:34px; line-height:1.02; font-weight:500; letter-spacing:-1.15px; }
        .ap-intro h2 em { color:var(--ap-teal); font-weight:400; }
        .ap-intro p { max-width:300px; margin:0; color:var(--ap-muted); font-size:13px; line-height:19px; }
        .ap-partner-panel { position:relative; overflow:hidden; padding:17px; border:1px solid #dbe5d8; border-radius:20px; background:var(--ap-card); box-shadow:0 8px 20px rgba(45,76,59,.045); }
        .ap-partner-panel:before { position:absolute; top:-53px; right:-48px; width:145px; height:145px; border:1px solid rgba(23,102,95,.1); border-radius:50%; content:""; }
        .ap-partner-topline,.ap-section-head,.ap-goal-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .ap-section-label { color:#75847b; font-size:10px; font-weight:800; letter-spacing:.9px; text-transform:uppercase; }
        .ap-active { display:flex; align-items:center; gap:6px; padding:5px 9px; border-radius:20px; color:#1b655a; background:#e9f3e7; font-size:10px; font-weight:700; }
        .ap-active span { background:#4f9970; }
        .ap-pair { display:flex; align-items:center; justify-content:center; gap:18px; margin:20px 0 8px; }
        .ap-person { display:flex; min-width:61px; flex-direction:column; align-items:center; gap:7px; font-size:11px; }
        .ap-avatar { display:grid; width:51px; height:51px; place-items:center; border:2px solid var(--ap-card); border-radius:50%; font-family:Georgia,serif; font-size:19px; box-shadow:0 0 0 1px #dce7dd; }
        .ap-avatar-you { color:#6a5840; background:#e9dfc8; }
        .ap-avatar-jamie { color:#425c53; background:#d8e7d9; }
        .ap-pair-thread { display:flex; align-items:center; gap:5px; color:#c16d70; }
        .ap-pair-thread span { width:19px; height:1px; background:#d9c9bc; }
        .ap-partner-meta { display:flex; align-items:center; justify-content:center; gap:7px; margin:0 0 16px; color:#78857d; font-size:10px; }
        .ap-partner-meta i,.ap-commitment-meta i { width:3px; height:3px; border-radius:50%; background:#b7c5b9; }
        .ap-privacy { display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid #e5eadc; border-radius:13px; background:#f6f7ec; }
        .ap-privacy-icon { display:grid; width:28px; height:28px; flex:0 0 auto; place-items:center; border-radius:9px; color:#557469; background:#e6eee2; }
        .ap-privacy strong { display:block; margin:1px 0 4px; font-size:11px; line-height:15px; }
        .ap-privacy p { margin:0; color:var(--ap-muted); font-size:10px; line-height:15px; }
        .ap-encourage { display:flex; width:100%; align-items:center; gap:8px; margin-top:11px; padding:11px 12px; border:1px solid #eadcce; border-radius:11px; color:#6c5147; background:#fffaf2; font:600 11px "DM Sans",sans-serif; text-align:left; cursor:pointer; }
        .ap-encourage>svg:first-child { color:#c85769; }
        .ap-encourage-more { margin-left:auto; color:#87938a; }
        .ap-encourage-options { display:flex; flex-wrap:wrap; gap:7px; margin-top:9px; }
        .ap-encourage-options button { display:flex; align-items:center; gap:6px; padding:8px 9px; border:1px solid #e7e6d8; border-radius:9px; color:#45655a; background:#f8f8ef; font:600 10px "DM Sans",sans-serif; cursor:pointer; }
        .ap-goals-unavailable { display:flex; align-items:flex-start; gap:11px; margin-top:12px; padding:13px 14px; border:1px dashed #cdd9cb; border-radius:15px; background:rgba(232,239,222,.6); }
        .ap-goal-mark { display:grid; width:31px; height:31px; flex:0 0 auto; place-items:center; border-radius:10px; color:#557a67; background:#dce9d8; }
        .ap-goal-copy { min-width:0; flex:1; }
        .ap-goal-heading { justify-content:flex-start; gap:8px; }
        .ap-goal-heading strong { font-size:12px; }
        .ap-goal-heading span { padding:4px 7px; border-radius:9px; color:#718077; background:#edf1e8; font-size:9px; font-weight:700; }
        .ap-goal-copy p { margin:6px 0 0; color:#697971; font-size:10px; line-height:15px; }
        .ap-section { margin-top:27px; }
        .ap-section-head { align-items:flex-end; }
        .ap-section-head h2,.ap-settings-heading h2 { margin:4px 0 0; font-family:Georgia,"Times New Roman",serif; font-size:22px; line-height:27px; font-weight:500; letter-spacing:-.4px; }
        .ap-date { display:flex; align-items:center; gap:5px; padding:6px 8px; border-radius:8px; color:#60776e; background:#eaf0e4; font-size:9px; font-weight:800; letter-spacing:.45px; }
        .ap-today-card { margin-top:12px; padding:16px; border-radius:17px; color:#f8f7ea; background:#285e55; }
        .ap-small-label { color:#c5d9c6; font-size:8px; font-weight:800; letter-spacing:1px; }
        .ap-today-copy h3 { margin:7px 0 5px; font-family:Georgia,"Times New Roman",serif; font-size:21px; line-height:26px; font-weight:500; letter-spacing:-.25px; }
        .ap-today-copy p { max-width:280px; margin:0; color:#d4e0d4; font-size:11px; line-height:16px; }
        .ap-progress-row { display:flex; align-items:center; gap:10px; margin:17px 0 13px; color:#e7eee2; font-size:10px; white-space:nowrap; }
        .ap-progress-track,.ap-commitment-track { height:5px; overflow:hidden; flex:1; border-radius:8px; background:rgba(238,244,222,.25); }
        .ap-progress-track span,.ap-commitment-track span { display:block; height:100%; border-radius:inherit; background:#d8b783; }
        .ap-checkin-button { display:flex; width:100%; min-height:43px; align-items:center; justify-content:center; gap:8px; border:0; border-radius:11px; color:#244f49; background:#f3f1df; font:700 12px "DM Sans",sans-serif; cursor:pointer; }
        .ap-checkin-button.is-done { color:#244f49; background:#d6e7d2; }
        .ap-xp-note { display:flex; justify-content:center; align-items:center; gap:5px; margin:10px 0 0; color:#d3dfd1; font-size:9px; line-height:13px; text-align:center; }
        .ap-confirmation-hint { display:flex; align-items:flex-start; gap:8px; margin-top:10px; padding:0 4px; color:#74827a; font-size:10px; line-height:15px; }
        .ap-confirmation-hint svg { flex:0 0 auto; color:#7c9686; }
        .ap-confirmation-hint strong { color:#536b60; }
        .ap-section-desc { margin:6px 0 13px; color:var(--ap-muted); font-size:11px; line-height:16px; }
        .ap-add-button { display:flex; align-items:center; gap:5px; padding:8px 10px; border:1px solid #d4e0d3; border-radius:9px; color:#315f53; background:#eef3e8; font:700 10px "DM Sans",sans-serif; cursor:pointer; }
        .ap-commitment-list { display:flex; flex-direction:column; gap:9px; }
        .ap-commitment { display:flex; gap:11px; padding:13px; border:1px solid #e1e7dc; border-radius:15px; background:var(--ap-card); }
        .ap-commitment-index { display:grid; width:28px; height:28px; flex:0 0 auto; place-items:center; border-radius:9px; font:600 11px Georgia,serif; }
        .tone-mint { color:#417267; background:#e4efe2; }
        .tone-peach { color:#a66d59; background:#f5e8dc; }
        .ap-commitment-main { min-width:0; flex:1; }
        .ap-commitment-titleline { display:flex; align-items:flex-start; justify-content:space-between; gap:7px; }
        .ap-commitment-titleline h3 { margin:2px 0 0; font-size:12px; line-height:16px; font-weight:700; }
        .ap-count { flex:0 0 auto; color:#597d6f; font:700 11px "DM Sans",sans-serif; }
        .ap-commitment-main>p { margin:4px 0 7px; color:#75827a; font-size:10px; line-height:14px; }
        .ap-commitment-meta { display:flex; align-items:center; gap:6px; color:#79877f; font-size:9px; }
        .ap-commitment-track { height:4px; margin:9px 0 7px; background:#e8ede3; }
        .ap-commitment-track span { background:#78a28b; }
        .ap-commitment:nth-child(2) .ap-commitment-track span { background:#d49d79; }
        .ap-inline-checkin { display:flex; align-items:center; gap:5px; padding:0; border:0; color:#397063; background:none; font:700 10px "DM Sans",sans-serif; cursor:pointer; }
        .ap-checkin-status { display:flex; align-items:flex-start; gap:5px; color:#8b6c51; font-size:9px; line-height:13px; }
        .ap-checkin-status svg { flex:0 0 auto; color:#b18456; }
        .ap-activity-section { margin-top:29px; padding-top:19px; border-top:1px solid #dce5d9; }
        .ap-activity-icon { margin:0 2px 5px 0; color:#63816f; }
        .ap-activity-item { display:flex; gap:10px; margin-top:13px; padding:13px; border:1px solid #e2e8dd; border-radius:14px; background:rgba(255,254,248,.78); }
        .ap-activity-avatar { display:grid; width:31px; height:31px; flex:0 0 auto; place-items:center; border-radius:50%; color:#4b6756; background:#dce9d9; font:600 13px Georgia,serif; }
        .ap-activity-content { min-width:0; flex:1; }
        .ap-activity-content p { margin:1px 0 3px; color:#50645b; font-size:10px; line-height:15px; }
        .ap-activity-content p strong { color:var(--ap-ink); }
        .ap-activity-content>span,.ap-notification-content>span { color:#89948a; font-size:9px; }
        .ap-confirm-button { display:flex; align-items:center; gap:5px; margin-top:9px; padding:7px 9px; border:1px solid #d7e3d5; border-radius:8px; color:#3e6e60; background:#f2f6ec; font:700 9px "DM Sans",sans-serif; cursor:pointer; }
        .ap-notification { display:flex; align-items:flex-start; gap:10px; margin-top:8px; padding:12px; border-radius:13px; background:#ebf0e5; }
        .ap-notification-mark { display:grid; width:28px; height:28px; flex:0 0 auto; place-items:center; border-radius:9px; color:#79877e; background:#f6f7ef; }
        .ap-notification-mark.unread { color:#a55c5a; background:#f8e8df; }
        .ap-notification-content { flex:1; }
        .ap-notification-content strong { font-size:10px; }
        .ap-notification-content p { margin:3px 0; color:#61746a; font:italic 12px Georgia,serif; }
        .ap-notification>button { display:grid; width:25px; height:25px; place-items:center; border:1px solid #d5e0d3; border-radius:8px; color:#547468; background:#f5f7ee; cursor:pointer; }
        .ap-message-panel { position:relative; overflow:hidden; margin-top:28px; padding:18px; border-radius:19px; color:#f7f4e8; background:#bf6e67; }
        .ap-message-panel:after { position:absolute; top:-37px; right:-19px; width:152px; height:152px; border:1px solid rgba(255,255,255,.23); border-radius:50%; content:""; box-shadow:0 0 0 17px rgba(255,255,255,.055),0 0 0 34px rgba(255,255,255,.045); }
        .ap-message-deco { position:absolute; top:17px; right:17px; display:grid; width:38px; height:38px; place-items:center; border:1px solid rgba(255,255,255,.27); border-radius:13px; color:#fff4e7; }
        .ap-message-copy { position:relative; z-index:1; }
        .ap-message-copy .ap-kicker { color:#f1d8c9; }
        .ap-message-copy h2 { margin:8px 0 6px; font:500 23px/1.08 Georgia,"Times New Roman",serif; letter-spacing:-.4px; }
        .ap-message-copy p { max-width:220px; margin:0; color:#f5e7dc; font-size:10px; line-height:15px; }
        .ap-message-panel>button { position:relative; z-index:1; display:flex; align-items:center; gap:7px; margin-top:15px; padding:9px 11px; border:0; border-radius:9px; color:#704a42; background:#fff3e5; font:700 10px "DM Sans",sans-serif; cursor:pointer; }
        .ap-partner-settings { margin-top:29px; padding:0 1px; }
        .ap-settings-heading { margin-bottom:12px; }
        .ap-settings-heading h2 { font-size:19px; line-height:24px; }
        .ap-settings-action { display:flex; width:100%; align-items:center; gap:10px; padding:12px 2px; border:0; border-bottom:1px solid #dce5d9; color:var(--ap-ink); background:none; text-align:left; cursor:pointer; }
        .ap-settings-icon { display:grid; width:32px; height:32px; flex:0 0 auto; place-items:center; border-radius:10px; color:#55786b; background:#e7eee2; }
        .ap-settings-action>span:nth-child(2) { flex:1; }
        .ap-settings-action strong,.ap-settings-action small { display:block; }
        .ap-settings-action strong { font-size:11px; }
        .ap-settings-action small { margin-top:3px; color:#77857c; font-size:9px; line-height:13px; }
        .ap-settings-action>svg { color:#87928a; }
        .ap-end-action .ap-settings-icon { color:#a25f5a; background:#f4e6dc; }
        .ap-trust-footer { display:flex; align-items:flex-start; gap:9px; margin-top:16px; padding:12px; border:1px solid #dce7dc; border-radius:12px; color:#668075; background:#eef2e8; }
        .ap-trust-footer>svg { flex:0 0 auto; margin-top:1px; }
        .ap-trust-footer p { margin:0; color:#687a70; font-size:9px; line-height:14px; }
        .ap-trust-footer strong { color:#355b50; }
        .ap-footer { padding:24px 0 9px; color:#839087; font:italic 12px Georgia,serif; text-align:center; }
        .ap-modal-backdrop { position:fixed; z-index:10; inset:0; display:flex; align-items:flex-end; justify-content:center; padding:16px; background:rgba(26,46,41,.44); }
        .ap-modal { position:relative; width:min(100%,430px); padding:23px 20px 18px; border:1px solid #dce5d9; border-radius:22px; color:var(--ap-ink); background:#fffef8; box-shadow:0 18px 48px rgba(25,45,38,.2); animation:ap-modal-in .22s ease-out both; }
        .ap-modal-close { position:absolute; top:15px; right:15px; display:grid; width:31px; height:31px; place-items:center; border:1px solid #e2e8de; border-radius:10px; color:#63746c; background:#f7f8f0; cursor:pointer; }
        .ap-modal-icon { display:grid; width:39px; height:39px; place-items:center; margin-bottom:14px; border-radius:13px; color:#5d776b; background:#e8efe3; }
        .ap-modal h2 { margin:7px 0 8px; font:500 25px/1.1 Georgia,serif; letter-spacing:-.4px; }
        .ap-modal>p { margin:0 0 17px; color:#6d7b72; font-size:12px; line-height:18px; }
        .ap-modal-primary,.ap-modal-cancel { display:flex; width:100%; min-height:42px; align-items:center; justify-content:center; gap:7px; border-radius:10px; font:700 11px "DM Sans",sans-serif; cursor:pointer; }
        .ap-modal-primary { border:0; color:#f8f6e9; background:#285e55; }
        .ap-modal-cancel { margin-top:7px; border:1px solid #e1e7dc; color:#536a5f; background:transparent; }
        @keyframes ap-modal-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @media (min-width:600px) {
          .ap-redesign { padding:0 24px 36px; }
          .ap-topbar { padding-top:23px; }
          .ap-intro { padding-top:35px; }
          .ap-intro h2 { font-size:40px; }
          .ap-partner-panel { padding:20px; }
          .ap-modal-backdrop { align-items:center; }
        }
        @media (prefers-reduced-motion:reduce) {
          .ap-modal { animation:none; }
        }
      `}</style>
    </main>
  );
}
