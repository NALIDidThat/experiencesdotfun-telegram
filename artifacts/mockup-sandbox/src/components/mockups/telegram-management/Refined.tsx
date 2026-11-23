import './_group.css';
import { useMemo, useState } from 'react';

const activity = {
  7: [24, 37, 29, 46, 32, 51, 42],
  30: [22, 28, 35, 31, 42, 38, 51],
  90: [18, 25, 22, 39, 33, 45, 51],
};

const initialPhrases = ['buy followers', 'investment giveaway'];
const initialLinks = ['experiences.fun', 'communityaction.london'];

function SectionTitle({ overline, title, detail, tag }: { overline: string; title: string; detail: string; tag?: string }) {
  return (
    <div className="ref-section-title">
      <div className="ref-title-line">
        <div>
          <span className="ref-overline">{overline}</span>
          <h2>{title}</h2>
        </div>
        {tag ? <span className="ref-count">{tag}</span> : null}
      </div>
      <p>{detail}</p>
    </div>
  );
}

export function Refined() {
  const [interval, setInterval] = useState('3 hours');
  const [riddlesOn, setRiddlesOn] = useState(true);
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>('samira');
  const [welcome, setWelcome] = useState('Welcome to Green Neighbourhoods. Glad you’re here — introduce yourself and find your next community experience.');
  const [welcomeSaved, setWelcomeSaved] = useState(false);
  const [phrases, setPhrases] = useState(initialPhrases);
  const [links, setLinks] = useState(initialLinks);
  const [phraseDraft, setPhraseDraft] = useState('');
  const [linkDraft, setLinkDraft] = useState('');
  const [sample, setSample] = useState('');
  const [previewed, setPreviewed] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);

  const members = useMemo(() => [
    { id: 'samira', name: 'Samira Ahmed', username: '@samira', joined: '12 Oct', count: 86, history: [['Today', '8 messages'], ['Yesterday', '5 messages'], ['22 Nov', '7 messages']] },
    { id: 'mohamed', name: 'Mohamed Ali', username: '@mohamed', joined: '4 Sep', count: 64, history: [['Today', '4 messages'], ['21 Nov', '6 messages']] },
    { id: 'maya', name: 'Maya Patel', username: '@mayap', joined: '18 Aug', count: 51, history: [['Yesterday', '3 messages'], ['20 Nov', '5 messages']] },
  ].filter((member) => `${member.name} ${member.username}`.toLowerCase().includes(search.toLowerCase())), [search]);

  return (
    <main className="refined-phone">
      <style>{`
        .refined-phone {
          --paper:#fff; --surface:#fff; --ink:#111; --muted:#666; --line:#eaeaea;
          --pink:#f20789; --pink-soft:#fff0f8; --teal:#04adbf; --teal-soft:#e8f8fa; --gold:#6805f2;
          width:min(100%,430px); min-height:100dvh; margin:0 auto; overflow:hidden; background:var(--paper);
          color:var(--ink); font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:14px;
        }
        .refined-phone *{box-sizing:border-box}
        .refined-phone button,.refined-phone input,.refined-phone textarea{font:inherit}
        .refined-phone button{cursor:pointer}
        .ref-header{padding:calc(14px + env(safe-area-inset-top)) 20px 19px;background:var(--surface);border-bottom:1px solid var(--line)}
        .ref-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}
        .ref-back,.ref-settings{height:44px;min-width:44px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);font-size:20px}
        .ref-wordmark{font-size:11px;font-weight:800;letter-spacing:.15em;color:var(--teal)}
        .ref-wordmark i{font-style:normal;color:var(--pink)}
        .ref-identity{display:flex;gap:13px;align-items:flex-start}
        .ref-group-mark{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:16px;background:var(--teal-soft);color:var(--teal);font-size:14px;font-weight:850;letter-spacing:-.04em}
        .ref-group-copy{flex:1;min-width:0}
        .ref-overline{font-size:10px;font-weight:800;letter-spacing:.13em;color:var(--teal);text-transform:uppercase}
        .ref-group-copy h1{margin:4px 0 2px;font-size:22px;line-height:1.12;letter-spacing:-.045em}
        .ref-group-copy p{margin:0;color:var(--muted);font-size:13px}
        .ref-connection{display:flex;align-items:center;gap:7px;margin-top:12px;color:#05727d;font-size:12px;font-weight:700}
        .ref-live-dot{width:8px;height:8px;border-radius:50%;background:#04adbf;box-shadow:0 0 0 4px #e8f8fa}
        .ref-member-total{font-weight:500;color:var(--muted)}
        .ref-shortcut{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;margin-top:17px;padding:12px 14px;border:0;border-radius:14px;background:var(--pink);color:#fff;text-align:left}
        .ref-shortcut span:first-child{font-size:12px;font-weight:700}
        .ref-shortcut small{display:block;margin-top:3px;color:#ffe1f1;font-size:11px;font-weight:400}
        .ref-shortcut .ref-arrow{font-size:20px;color:#fff}
        .ref-content{display:flex;flex-direction:column;gap:14px;padding:15px 14px calc(34px + env(safe-area-inset-bottom))}
        .ref-block{padding:17px;border:1px solid var(--line);border-radius:19px;background:var(--surface);box-shadow:0 2px 8px rgba(29,64,56,.025)}
        .ref-updates{padding:16px 17px 14px;border-left:3px solid var(--pink)}
        .ref-update-kicker{display:flex;align-items:center;gap:8px;color:var(--pink);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
        .ref-update-main{display:flex;align-items:center;gap:12px;margin-top:12px}
        .ref-calendar{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--pink-soft);color:var(--pink);font-weight:850;font-size:11px;line-height:1.05;text-align:center}
        .ref-calendar b{font-size:15px}
        .ref-update-copy{flex:1;min-width:0}
        .ref-update-copy strong{display:block;font-size:14px;letter-spacing:-.02em}
        .ref-update-copy small{display:block;margin-top:4px;color:var(--muted);font-size:11px}
        .ref-chevron{color:#9aadaa;font-size:21px}
        .ref-section-title{margin-bottom:13px}
        .ref-title-line{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .ref-section-title h2{margin:3px 0 0;font-size:17px;line-height:1.15;letter-spacing:-.035em}
        .ref-section-title p{margin:6px 0 0;color:var(--muted);font-size:11px;line-height:1.45}
        .ref-count{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 8px;border-radius:9px;background:var(--teal-soft);color:var(--teal);font-size:11px;font-weight:800}
        .ref-label{font-size:11px;color:var(--muted);line-height:1.5}
        .ref-intervals{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:13px 0 12px}
        .ref-chip{min-height:40px;padding:8px 5px;border:1px solid var(--line);border-radius:11px;background:#fff;color:var(--ink);font-size:11px;font-weight:700}
        .ref-chip.active{border-color:var(--pink);background:var(--pink-soft);color:var(--pink)}
        .ref-toggle{display:flex;min-height:46px;width:100%;align-items:center;justify-content:center;gap:8px;border:0;border-radius:12px;background:var(--teal-soft);color:var(--teal);font-size:12px;font-weight:800}
        .ref-toggle.off{background:var(--ink);color:white}
        .ref-feedback{margin:9px 0 0;color:var(--teal);font-size:11px}
        .ref-textarea,.ref-input{width:100%;border:1px solid var(--line);border-radius:12px;background:#fbfcfa;color:var(--ink);outline:none}
        .ref-textarea{min-height:96px;padding:12px;resize:vertical;font-size:12px;line-height:1.5}
        .ref-textarea:focus,.ref-input:focus{border-color:#8cb8ac;box-shadow:0 0 0 3px #eaf5f1}
        .ref-primary{display:flex;min-height:44px;align-items:center;justify-content:center;width:100%;margin-top:9px;border:0;border-radius:12px;background:var(--pink);color:#fff;font-size:12px;font-weight:800}
        .ref-save-state{min-height:14px;margin-top:6px;color:var(--teal);font-size:11px}
        .ref-health{padding:17px;background:var(--teal-soft);border:1px solid #c8eef2;border-radius:19px}
        .ref-health .ref-section-title{margin-bottom:12px}
        .ref-health-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .ref-health-item{padding:12px;border-radius:13px;background:rgba(255,255,255,.83)}
        .ref-health-item span{display:block;min-height:29px;color:var(--muted);font-size:10px;line-height:1.35}
        .ref-health-item b{display:block;margin-top:4px;font-size:22px;letter-spacing:-.04em}
        .ref-health-item small{display:block;color:var(--muted);font-size:9px}
        .ref-period{display:flex;gap:5px;padding:4px;border-radius:12px;background:var(--paper)}
        .ref-period button{flex:1;min-height:36px;border:0;border-radius:9px;background:transparent;color:var(--muted);font-size:11px;font-weight:700}
        .ref-period button.active{background:#fff;color:var(--teal);box-shadow:0 1px 4px #143e3517}
        .ref-chart{height:118px;margin-top:14px;position:relative}
        .ref-chart svg{width:100%;height:100%;overflow:visible}
        .ref-chart-labels{display:flex;justify-content:space-between;margin-top:3px;color:var(--muted);font-size:9px}
        .ref-chart-summary{display:flex;align-items:baseline;justify-content:space-between;margin-top:10px}
        .ref-chart-summary b{font-size:13px}
        .ref-chart-summary span{color:var(--muted);font-size:10px}
        .ref-note{margin:11px 0 0;padding-top:10px;border-top:1px solid var(--line);color:var(--muted);font-size:10px;line-height:1.5}
        .ref-search{position:relative;margin-bottom:8px}
        .ref-input{height:44px;padding:0 12px;font-size:12px}
        .ref-search .ref-input{padding-left:36px}
        .ref-search-icon{position:absolute;top:12px;left:13px;color:#91a49d}
        .ref-member{border-top:1px solid var(--line)}
        .ref-member-button{display:flex;width:100%;align-items:center;gap:10px;min-height:62px;padding:10px 0;border:0;background:transparent;text-align:left;color:inherit}
        .ref-rank{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:var(--paper);color:var(--muted);font-size:10px;font-weight:800}
        .ref-person{flex:1;min-width:0}
        .ref-person b{display:block;font-size:12px}
        .ref-person small{display:block;margin-top:3px;color:var(--muted);font-size:10px}
        .ref-qualifying{min-width:54px;text-align:right}
        .ref-qualifying b{display:block;font-size:16px}
        .ref-qualifying small{color:var(--muted);font-size:9px}
        .ref-history{padding:0 12px 12px 35px}
        .ref-history-caption{margin:0 0 8px;color:var(--muted);font-size:10px}
        .ref-history-row{display:flex;justify-content:space-between;padding:6px 0;color:var(--ink);font-size:10px}
        .ref-history-row span:last-child{color:var(--muted)}
        .ref-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid var(--line);font-size:11px}
        .ref-row strong{font-size:11px}
        .ref-row small{display:block;margin-top:4px;color:var(--muted);font-size:10px}
        .ref-status{padding:5px 8px;border-radius:8px;background:var(--teal-soft);color:var(--teal);font-size:9px;font-weight:800;white-space:nowrap}
        .ref-status.muted{background:#f2f3ef;color:#6d7773}
        .ref-xp-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .ref-xp-top strong{font-size:15px;letter-spacing:-.025em}
        .ref-xp-top span{padding:6px 9px;border-radius:9px;background:var(--teal-soft);color:var(--teal);font-size:10px;font-weight:800}
        .ref-progress{height:8px;margin:13px 0 12px;overflow:hidden;border-radius:20px;background:#e9eeea}
        .ref-progress i{display:block;width:42%;height:100%;border-radius:inherit;background:var(--pink)}
        .ref-budget-sub{display:flex;justify-content:space-between;color:var(--muted);font-size:10px}
        .ref-rule-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-top:1px solid var(--line)}
        .ref-rule-row code{overflow-wrap:anywhere;color:var(--ink);font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px}
        .ref-remove{min-height:34px;padding:0 8px;border:0;border-radius:9px;background:#fff3f5;color:#b83a56;font-size:10px;font-weight:700}
        .ref-add-row{display:flex;gap:8px;margin-top:9px}
        .ref-add-row .ref-input{flex:1;min-width:0}
        .ref-add{min-width:60px;min-height:44px;padding:0 13px;border:0;border-radius:11px;background:var(--teal);color:#fff;font-size:11px;font-weight:800}
        .ref-rule-note{margin:9px 0 0;color:var(--muted);font-size:10px;line-height:1.45}
        .ref-test-button{min-height:44px;padding:0 14px;border:0;border-radius:11px;background:var(--ink);color:white;font-size:11px;font-weight:800}
        .ref-mobile-footer{padding:3px 0 12px;text-align:center;color:var(--muted);font-size:10px}
        @media(min-width:600px){.refined-phone{border-left:1px solid #e5ebe5;border-right:1px solid #e5ebe5}.ref-content{padding-left:18px;padding-right:18px}}
        @media(prefers-reduced-motion:no-preference){.refined-phone .ref-block{animation:ref-rise .35s ease both}.refined-phone .ref-block:nth-child(2){animation-delay:.03s}.refined-phone .ref-block:nth-child(3){animation-delay:.06s}.refined-phone .ref-block:nth-child(4){animation-delay:.09s}@keyframes ref-rise{from{opacity:.75;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}}
      `}</style>
      <header className="ref-header">
        <div className="ref-nav">
          <button className="ref-back" aria-label="Back">‹</button>
          <div className="ref-wordmark">experiences<i>.</i>fun</div>
          <button className="ref-settings" aria-label="Open Telegram group management" onClick={() => setShortcutOpen(!shortcutOpen)}>↗</button>
        </div>
        <div className="ref-identity">
          <div className="ref-group-mark">GN</div>
          <div className="ref-group-copy">
            <span className="ref-overline">Linked Telegram group</span>
            <h1>Green Neighbourhoods</h1>
            <p>Community Action London</p>
            <div className="ref-connection"><i className="ref-live-dot" /> Connected <span className="ref-member-total">· 384 Telegram members</span></div>
          </div>
        </div>
        <button className="ref-shortcut" onClick={() => setShortcutOpen(!shortcutOpen)}>
          <span>Manage this group in Telegram<small>{shortcutOpen ? 'Telegram shortcut selected' : 'Settings and bot permissions'}</small></span>
          <span className="ref-arrow">↗</span>
        </button>
      </header>

      <div className="ref-content">
        <section className="ref-block ref-updates">
          <div className="ref-update-kicker"><span>Community updates</span><span style={{ color: 'var(--muted)', fontWeight: 600, letterSpacing: 0 }}>· Recent</span></div>
          <div className="ref-update-main">
            <div className="ref-calendar"><span>NOV</span><b>30</b></div>
            <div className="ref-update-copy"><strong>Saturday park clean-up</strong><small>New experience · 12 participants</small></div>
            <span className="ref-chevron">›</span>
          </div>
        </section>

        <section className="ref-block">
          <SectionTitle overline="Group routine" title="Scheduled riddles" detail={`Automatic posts are ${riddlesOn ? 'on' : 'paused'} · every ${interval}`} tag={riddlesOn ? 'ON' : 'OFF'} />
          <p className="ref-label">A new riddle is posted after each interval. Each round stays open for 15 minutes. This setting applies to this group only.</p>
          <div className="ref-intervals">{['30 min', '1 hour', '3 hours', '6 hours', '12 hours', '24 hours'].map((choice) => <button key={choice} className={`ref-chip ${interval === choice ? 'active' : ''}`} onClick={() => setInterval(choice)}>{choice}{interval === choice ? ' ✓' : ''}</button>)}</div>
          <button className={`ref-toggle ${!riddlesOn ? 'off' : ''}`} onClick={() => setRiddlesOn(!riddlesOn)}>{riddlesOn ? 'Ⅱ  Pause automatic riddles' : '▶  Turn automatic riddles on'}</button>
        </section>

        <section className="ref-block">
          <SectionTitle overline="First hello" title="Welcome new members" detail="Sent to the group when someone joins." />
          <textarea className="ref-textarea" aria-label="Welcome message" value={welcome} onChange={(event) => { setWelcome(event.target.value); setWelcomeSaved(false); }} />
          <button className="ref-primary" onClick={() => setWelcomeSaved(true)}>Save welcome message</button>
          <div className="ref-save-state">{welcomeSaved ? 'Welcome message saved for this group.' : ' '}</div>
        </section>

        <section className="ref-health">
          <SectionTitle overline="At a glance · Today" title="Community health" detail="Tracked activity and automated protection" />
          <div className="ref-health-grid">
            <div className="ref-health-item"><span>Members with XP activity today</span><b>18</b><small>tracked profiles</small></div>
            <div className="ref-health-item"><span>Qualifying messages</span><b>126</b><small>recorded today</small></div>
            <div className="ref-health-item"><span>Moderation actions</span><b>3</b><small>automated matches</small></div>
            <div className="ref-health-item"><span>XP distributed</span><b>420</b><small>XP today</small></div>
          </div>
        </section>

        <section className="ref-block">
          <SectionTitle overline="Group activity" title="Message activity" detail="Qualifying messages received from linked-group updates." />
          <div className="ref-period">{([7, 30, 90] as const).map((n) => <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>{n} days</button>)}</div>
          <div className="ref-chart">
            <svg viewBox="0 0 320 118" preserveAspectRatio="none" aria-label={`${days}-day qualifying message activity trend`}>
              <defs><linearGradient id="ref-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#04adbf" stopOpacity=".18" /><stop offset="1" stopColor="#04adbf" stopOpacity="0" /></linearGradient></defs>
              {[25, 58, 91].map((y) => <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#e8eeea" strokeDasharray="3 5" />)}
              <path d={`M0 98 ${activity[days].map((value, index) => `L${index * 53.3} ${103 - value * 1.45}`).join(' ')} L320 118 L0 118Z`} fill="url(#ref-fill)" />
              <polyline points={activity[days].map((value, index) => `${index * 53.3},${103 - value * 1.45}`).join(' ')} fill="none" stroke="#04adbf" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              {activity[days].map((value, index) => <circle key={index} cx={index * 53.3} cy={103 - value * 1.45} r="3.2" fill="#fff" stroke="#04adbf" strokeWidth="2" />)}
            </svg>
          </div>
          <div className="ref-chart-labels"><span>{days === 7 ? '24 Nov' : days === 30 ? '1 Nov' : '3 Sep'}</span><span>{days === 7 ? 'Today' : 'Today'}</span></div>
          <div className="ref-chart-summary"><b>{days === 7 ? '261' : days === 30 ? '1,184' : '3,706'} qualifying messages</b><span>daily total · {days} days</span></div>
          <p className="ref-note">Counts include qualifying human text or captions only. Message activity is not a measure of real-world contribution.</p>
        </section>

        <section className="ref-block">
          <SectionTitle overline="People" title="Tracked members" detail="Search people and review qualifying message totals." tag="238" />
          <div className="ref-search"><span className="ref-search-icon">⌕</span><input className="ref-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or username" aria-label="Search tracked members" /></div>
          <p className="ref-note" style={{ margin: '0 0 8px', padding: 0, border: 0 }}>Counts use the existing XP message rule: at least seven words, excluding commands. Tracking begins when the bot is linked; older Telegram history is unavailable.</p>
          {members.map((member, index) => <div className="ref-member" key={member.id}>
            <button className="ref-member-button" onClick={() => setExpanded(expanded === member.id ? null : member.id)} aria-expanded={expanded === member.id}>
              <span className="ref-rank">{index + 1}</span><span className="ref-person"><b>{member.name}</b><small>{member.username} · Joined {member.joined}</small></span><span className="ref-qualifying"><b>{member.count}</b><small>eligible</small></span><span className="ref-chevron">{expanded === member.id ? '⌃' : '⌄'}</span>
            </button>
            {expanded === member.id ? <div className="ref-history"><p className="ref-history-caption">Recent qualifying-message history · last 30 days</p>{member.history.map(([date, amount]) => <div className="ref-history-row" key={date}><span>{date}</span><span>{amount}</span></div>)}</div> : null}
          </div>)}
          {members.length === 0 ? <p className="ref-note">No tracked members match that search.</p> : null}
        </section>

        <section className="ref-block">
          <SectionTitle overline="Automated protection" title="Moderation history" detail="Rule matches and whether Telegram removed the message." />
          <p className="ref-note" style={{ margin: '0 0 2px', padding: 0, border: 0 }}>Message text and links are not saved in this history.</p>
          <div className="ref-row"><div><strong>Banned phrase matched</strong><small>Today · Phrase rule</small></div><span className="ref-status">Removed by Telegram</span></div>
          <div className="ref-row"><div><strong>Unapproved link matched</strong><small>Yesterday · Link rule</small></div><span className="ref-status muted">Could not remove</span></div>
          <div className="ref-row"><div><strong>Banned phrase matched</strong><small>22 Nov · Phrase rule</small></div><span className="ref-status">Removed by Telegram</span></div>
        </section>

        <section className="ref-block">
          <SectionTitle overline="Change log" title="Administrator changes" detail="Recent protection and riddle setting updates." />
          <div className="ref-row"><div><strong>Riddle interval updated</strong><small>Nadia Hussein · @nadia</small></div><span className="ref-label">Today</span></div>
          <div className="ref-row"><div><strong>Trusted link added</strong><small>Omar Hassan · @omarh</small></div><span className="ref-label">Yesterday</span></div>
          <div className="ref-row"><div><strong>Phrase protection enabled</strong><small>Nadia Hussein · @nadia</small></div><span className="ref-label">18 Nov</span></div>
        </section>

        <section className="ref-block">
          <SectionTitle overline="Check before saving" title="Preview protection rules" detail="Test a sample without posting or saving it." />
          <textarea className="ref-textarea" aria-label="Sample message to test against protection rules" placeholder="Paste a sample message" value={sample} onChange={(event) => { setSample(event.target.value); setPreviewed(false); }} />
          <button className="ref-test-button" style={{ marginTop: 9 }} onClick={() => setPreviewed(Boolean(sample.trim()))}>Test sample</button>
          {previewed ? <p className="ref-feedback">Sample checked against {phrases.length} phrase rules and {links.length} trusted links.</p> : null}
        </section>

        <section className="ref-block">
          <SectionTitle overline="Daily allowance" title="Community XP today" detail="Daily budget and remaining allowance." />
          <div className="ref-xp-top"><strong>420 <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 500 }}>/ 1,000 XP</span></strong><span>Protection on</span></div>
          <div className="ref-progress"><i /></div>
          <div className="ref-budget-sub"><span>580 XP remaining today</span><span>Resets 00:00 UTC</span></div>
          <div className="ref-row"><span>Lifetime XP distributed</span><strong>18,420</strong></div>
        </section>

        <section className="ref-block">
          <SectionTitle overline="Protection rules" title="Banned phrases" detail="Matching messages are removed while phrase protection is on." tag={String(phrases.length)} />
          {phrases.map((phrase) => <div className="ref-rule-row" key={phrase}><code>{phrase}</code><button className="ref-remove" onClick={() => setPhrases(phrases.filter((item) => item !== phrase))}>Remove</button></div>)}
          <div className="ref-add-row"><input className="ref-input" value={phraseDraft} onChange={(event) => setPhraseDraft(event.target.value)} placeholder="Add a phrase" aria-label="Add a banned phrase" /><button className="ref-add" onClick={() => { if (phraseDraft.trim()) { setPhrases([...phrases, phraseDraft.trim()]); setPhraseDraft(''); } }}>Add</button></div>
        </section>

        <section className="ref-block">
          <SectionTitle overline="Protection rules" title="Whitelisted links" detail="Saved domains and paths are allowed; other links are removed." tag={String(links.length)} />
          {links.map((link) => <div className="ref-rule-row" key={link}><code>{link}</code><button className="ref-remove" onClick={() => setLinks(links.filter((item) => item !== link))}>Remove</button></div>)}
          <div className="ref-add-row"><input className="ref-input" value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="example.org or a page URL" aria-label="Add a trusted link" /><button className="ref-add" onClick={() => { if (linkDraft.trim()) { setLinks([...links, linkDraft.trim()]); setLinkDraft(''); } }}>Add</button></div>
          <p className="ref-rule-note">Saved domains include subdomains, and saved paths include child pages.</p>
        </section>
        <footer className="ref-mobile-footer">Green Neighbourhoods · group settings apply to this linked group</footer>
      </div>
    </main>
  );
}
