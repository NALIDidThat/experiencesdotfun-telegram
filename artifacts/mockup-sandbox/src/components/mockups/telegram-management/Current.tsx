import './_group.css';

const metrics = [
  ['XP members today', '18'],
  ['Qualifying messages', '126'],
  ['Moderation actions', '3'],
  ['XP distributed', '420'],
];

function Header({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return <div className="section-heading"><span className="icon">{icon}</span><div><b>{title}</b><small>{detail}</small></div></div>;
}

export function Current() {
  return (
    <main className="phone">
      <div className="topbar"><button aria-label="Back">‹</button><div><small className="eyebrow">GROUP OVERVIEW</small><h1>Green Neighbourhoods</h1><p>Community Action London</p><div className="status"><span className="dot" />Connected <span className="members">· 384 Telegram members</span></div></div><button aria-label="Settings">⚙</button></div>
      <div className="content">
        <section className="feed"><b>Community updates</b><small>Recent activity from this group</small><div className="feed-row"><span className="avatar">GN</span><div><b>Saturday park clean-up</b><small>New experience · 12 participants</small></div><span>›</span></div></section>
        <section className="card">
          <Header icon="?" title="Scheduled riddles" detail="On · every 3 hours" />
          <p>A new riddle is posted after each interval. Each round stays open for 15 minutes. Settings apply to this linked group only.</p>
          <div className="chips"><span>30 min</span><span>1 hour</span><span className="selected">3 hours ✓</span><span>6 hours</span><span>12 hours</span><span>24 hours</span></div>
          <button className="secondary">Pause automatic riddles</button>
        </section>
        <section className="card"><Header icon="✉" title="Welcome new members" detail="Send this message to the group when people join." /><div className="input">Welcome to Green Neighbourhoods!</div><button className="primary">Save welcome message</button></section>
        <section className="health"><div className="section-title"><b>Community health</b><small>Tracked activity and automated protection</small></div><div className="metric-grid">{metrics.map(([name, value]) => <div className="metric" key={name}><small>{name}</small><b>{value}</b></div>)}</div></section>
        <section className="card"><Header icon="↗" title="Message activity" detail="XP-eligible messages received from linked-group updates" /><div className="chips"><span className="selected">7 days</span><span>30 days</span><span>90 days</span></div><div className="line"><span>24 Nov</span><b>42 messages · 16 members</b></div><div className="line"><span>23 Nov</span><b>31 messages · 14 members</b></div></section>
        <section className="card"><Header icon="♙" title="Tracked members" detail="Search members and see their qualifying message totals" /><div className="input">Search name or username</div><div className="member"><b>1</b><div><strong>Samira Ahmed</strong><small>@samira · Joined 12 Oct</small></div><b>86 <small>eligible</small></b></div><div className="member"><b>2</b><div><strong>Mohamed Ali</strong><small>@mohamed · Joined 4 Sep</small></div><b>64 <small>eligible</small></b></div></section>
        <section className="card"><Header icon="◈" title="Moderation history" detail="Rule matches and whether Telegram removed the message" /><div className="line"><span>Banned phrase matched</span><b>Removed · today</b></div></section>
        <section className="card"><Header icon="◉" title="Community XP today" detail="Daily budget and remaining allowance" /><div className="budget"><b>420 / 1,000 XP</b><span>Protection on</span></div><div className="bar"><i /></div><div className="metric-grid compact"><div className="metric"><small>Remaining today</small><b>580</b></div><div className="metric"><small>Lifetime XP</small><b>18,420</b></div></div></section>
        <section className="card"><Header icon="⌁" title="Banned phrases" detail="Matching messages are removed while phrase protection is on." /><div className="line"><span>buy followers</span><b>Remove</b></div><div className="input">Add a phrase</div></section>
        <section className="card"><Header icon="↗" title="Whitelisted links" detail="Other links are removed while protection is on." /><div className="line"><span>experiences.fun</span><b>Remove</b></div><div className="input">example.org or a page URL</div></section>
      </div>
    </main>
  );
}
